from __future__ import annotations

import json
import os
import re
from datetime import date
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Callable
from urllib.parse import parse_qs, urlparse

from .fridge.config import fridge_data_dir, load_env_files
from .fridge.deepseek_client import DEFAULT_BASE_URL as DEEPSEEK_DEFAULT_BASE_URL
from .fridge.deepseek_client import DEFAULT_MODEL as DEEPSEEK_DEFAULT_MODEL
from .fridge.pipeline import FridgePipelineError, ImageValidationError, InvalidRequestError, ReceiptAnalyzer
from .fridge.store import FridgeInventoryStore, InventoryItemNotFoundError
from .memory import LongTermMemoryService, MemoryNotFoundError, MemoryValidationError

PROJECT_ROOT = Path(__file__).resolve().parents[1]


class MultipartParseError(ValueError):
    pass


def parse_multipart_form(content_type: str, body: bytes) -> dict[str, dict[str, Any]]:
    boundary_match = re.search(r"boundary=([^;]+)", content_type)
    if not boundary_match:
        raise MultipartParseError("Missing multipart boundary.")
    boundary = boundary_match.group(1).strip('"').encode("utf-8")
    fields: dict[str, dict[str, Any]] = {}

    for raw_part in body.split(b"--" + boundary):
        part = raw_part.strip()
        if not part or part == b"--":
            continue
        if part.endswith(b"--"):
            part = part[:-2].strip()
        header_block, separator, content = part.partition(b"\r\n\r\n")
        if not separator:
            continue
        headers = header_block.decode("utf-8", errors="replace").split("\r\n")
        header_map: dict[str, str] = {}
        for header in headers:
            if ":" in header:
                key, value = header.split(":", 1)
                header_map[key.lower()] = value.strip()

        disposition = header_map.get("content-disposition", "")
        name_match = re.search(r'name="([^"]+)"', disposition)
        if not name_match:
            continue

        filename_match = re.search(r'filename="([^"]*)"', disposition)
        content = content.rstrip(b"\r\n")
        name = name_match.group(1)
        fields[name] = {
            "filename": filename_match.group(1) if filename_match else "",
            "content_type": header_map.get("content-type", ""),
            "content": content,
        }

    return fields


class CalendarBackendHandler(BaseHTTPRequestHandler):
    analyzer: ReceiptAnalyzer
    inventory_store: FridgeInventoryStore
    memory_service: LongTermMemoryService

    def do_OPTIONS(self) -> None:
        self._send_json({"success": True})

    def do_GET(self) -> None:
        parsed_url = urlparse(self.path)
        if parsed_url.path == "/api/config":
            self._send_json(self._backend_config_status())
            return
        if parsed_url.path.startswith("/api/memory/"):
            self._handle_json_action(lambda: self._handle_memory_get(parsed_url))
            return
        if parsed_url.path == "/api/fridge/items":
            self._send_json({"success": True, "items": self.inventory_store.list_items()})
            return
        self._send_error("invalid_request", "Not found", status=404)

    def do_POST(self) -> None:
        parsed_url = urlparse(self.path)
        if parsed_url.path.startswith("/api/memory/"):
            self._handle_json_action(lambda: self._handle_memory_post(parsed_url.path))
            return

        if parsed_url.path == "/api/fridge/receipt/analyze":
            self._handle_json_action(self._handle_receipt_analysis)
            return

        if parsed_url.path == "/api/fridge/items":
            self._handle_json_action(self._handle_inventory_create)
            return

        self._send_error("invalid_request", "Not found", status=404)

    def do_PATCH(self) -> None:
        parsed_url = urlparse(self.path)
        if parsed_url.path == "/api/config":
            self._handle_json_action(self._handle_config_update)
            return
        if parsed_url.path.startswith("/api/memory/"):
            self._handle_json_action(lambda: self._handle_memory_patch(parsed_url.path))
            return
        item_id = _item_id_from_path(parsed_url.path)
        if item_id:
            self._handle_json_action(lambda: self._handle_inventory_update(item_id))
            return
        self._send_error("invalid_request", "Not found", status=404)

    def do_DELETE(self) -> None:
        parsed_url = urlparse(self.path)
        item_id = _item_id_from_path(parsed_url.path)
        if item_id:
            self._handle_json_action(lambda: self._handle_inventory_delete(item_id))
            return
        self._send_error("invalid_request", "Not found", status=404)

    def _handle_json_action(self, action: Callable[[], dict[str, Any]]) -> None:
        try:
            payload = action()
        except ImageValidationError as exc:
            self._send_error(exc.code, str(exc), status=400)
        except MultipartParseError as exc:
            self._send_error("invalid_request", str(exc), status=400)
        except InvalidRequestError as exc:
            self._send_error(exc.code, str(exc), status=exc.status)
        except FridgePipelineError as exc:
            self._send_error(exc.code, str(exc), status=exc.status)
        except InventoryItemNotFoundError:
            self._send_error("inventory_item_not_found", "Inventory item not found", status=404)
        except MemoryNotFoundError as exc:
            self._send_error("memory_not_found", str(exc), status=404)
        except MemoryValidationError as exc:
            self._send_error("invalid_memory_request", str(exc), status=400)
        except ValueError as exc:
            self._send_error("invalid_request", str(exc), status=400)
        except Exception as exc:  # pragma: no cover - server safety net
            self._send_error("invalid_request", f"Internal server error: {exc}", status=500)
        else:
            self._send_json(payload)

    def _handle_receipt_analysis(self) -> dict[str, Any]:
        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("multipart/form-data"):
            raise MultipartParseError("Request must be multipart/form-data.")

        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length)
        fields = parse_multipart_form(content_type, body)
        image = fields.get("image")
        if image is None:
            raise ImageValidationError("Missing image file field.")

        purchase_date = None
        purchase_date_field = fields.get("purchase_date")
        if purchase_date_field and purchase_date_field["content"]:
            try:
                purchase_date = date.fromisoformat(purchase_date_field["content"].decode("utf-8").strip())
            except ValueError as exc:
                raise InvalidRequestError("purchase_date must be an ISO date string") from exc

        timezone_field = fields.get("timezone")
        timezone = timezone_field["content"].decode("utf-8").strip() if timezone_field else None
        create_reminders_field = fields.get("create_reminders")
        create_reminders = (
            create_reminders_field["content"].decode("utf-8").strip().lower() == "true"
            if create_reminders_field
            else False
        )

        return self.analyzer.analyze(
            image_bytes=image["content"],
            filename=image["filename"],
            content_type=image["content_type"],
            purchase_date=purchase_date,
            timezone=timezone,
            create_reminders=create_reminders,
        )

    def _handle_inventory_create(self) -> dict[str, Any]:
        payload = self._read_json_body()
        return {"success": True, "item": self.inventory_store.create_item(payload)}

    def _handle_inventory_update(self, item_id: str) -> dict[str, Any]:
        payload = self._read_json_body()
        return {"success": True, "item": self.inventory_store.update_item(item_id, payload)}

    def _handle_inventory_delete(self, item_id: str) -> dict[str, Any]:
        self.inventory_store.delete_item(item_id)
        return {"success": True, "deleted": True, "item_id": item_id}

    def _handle_memory_get(self, parsed_url: Any) -> dict[str, Any]:
        path = parsed_url.path
        if path == "/api/memory/goals":
            return {"success": True, "goals": self.memory_service.list_goals()}

        if path == "/api/memory/projects":
            return {"success": True, "projects": self.memory_service.list_projects()}

        if path == "/api/memory/tool-runs":
            return {"success": True, "tool_runs": self.memory_service.list_tool_runs()}

        if path == "/api/memory/search":
            query = parse_qs(parsed_url.query).get("q", [""])[0]
            return {"success": True, "results": self.memory_service.search(query)}

        project_id = _memory_project_id_from_path(path)
        if project_id:
            return {"success": True, "project": self.memory_service.get_project(project_id)}

        project_milestones_id = _memory_project_child_id_from_path(path, "milestones")
        if project_milestones_id:
            return {
                "success": True,
                "milestones": self.memory_service.list_milestones(project_milestones_id),
            }

        project_actions_id = _memory_project_child_id_from_path(path, "actions")
        if project_actions_id:
            return {"success": True, "actions": self.memory_service.list_actions(project_actions_id)}

        project_progress_id = _memory_project_child_id_from_path(path, "progress")
        if project_progress_id:
            return {
                "success": True,
                "progress": self.memory_service.list_progress(project_progress_id),
            }

        project_tool_runs_id = _memory_project_child_id_from_path(path, "tool-runs")
        if project_tool_runs_id:
            return {
                "success": True,
                "tool_runs": self.memory_service.list_project_tool_runs(project_tool_runs_id),
            }

        raise MemoryNotFoundError("Not found")

    def _handle_memory_post(self, path: str) -> dict[str, Any]:
        payload = self._read_json_body()
        if path == "/api/memory/goals":
            return {"success": True, "goal": self.memory_service.create_goal(payload)}
        if path == "/api/memory/projects":
            return {"success": True, "project": self.memory_service.create_project(payload)}
        if path == "/api/memory/milestones":
            return {"success": True, "milestone": self.memory_service.create_milestone(payload)}
        if path == "/api/memory/actions":
            return {"success": True, "action": self.memory_service.create_action(payload)}
        if path == "/api/memory/progress":
            return {"success": True, "progress": self.memory_service.create_progress(payload)}
        if path == "/api/memory/tool-runs":
            return {"success": True, "tool_run": self.memory_service.create_tool_run(payload)}
        raise MemoryNotFoundError("Not found")

    def _handle_memory_patch(self, path: str) -> dict[str, Any]:
        payload = self._read_json_body()

        goal_id = _memory_entity_id_from_path(path, "goals")
        if goal_id:
            return {"success": True, "goal": self.memory_service.update_goal(goal_id, payload)}

        project_id = _memory_entity_id_from_path(path, "projects")
        if project_id:
            return {
                "success": True,
                "project": self.memory_service.update_project(project_id, payload),
            }

        milestone_id = _memory_entity_id_from_path(path, "milestones")
        if milestone_id:
            return {
                "success": True,
                "milestone": self.memory_service.update_milestone(milestone_id, payload),
            }

        action_id = _memory_entity_id_from_path(path, "actions")
        if action_id:
            return {"success": True, "action": self.memory_service.update_action(action_id, payload)}

        raise MemoryNotFoundError("Not found")

    def _handle_config_update(self) -> dict[str, Any]:
        payload = self._read_json_body()
        updates: dict[str, str] = {}

        deepseek_api_key = str(payload.get("deepseek_api_key", "")).strip()
        if deepseek_api_key:
            updates["DEEPSEEK_API_KEY"] = deepseek_api_key

        for payload_key, env_key in {
            "deepseek_base_url": "DEEPSEEK_BASE_URL",
            "deepseek_model": "DEEPSEEK_MODEL",
            "fridge_data_dir": "FRIDGE_DATA_DIR",
        }.items():
            if payload_key in payload:
                updates[env_key] = str(payload.get(payload_key, "")).strip()

        if updates:
            update_env_file(PROJECT_ROOT / ".env.local", updates)
            for key, value in updates.items():
                if value:
                    os.environ[key] = value
                elif key in os.environ:
                    del os.environ[key]

            self.__class__.analyzer = ReceiptAnalyzer()
            self.__class__.inventory_store = FridgeInventoryStore()

        return self._backend_config_status()

    def _backend_config_status(self) -> dict[str, Any]:
        return {
            "success": True,
            "deepseek": {
                "configured": bool(os.getenv("DEEPSEEK_API_KEY", "").strip()),
                "base_url": os.getenv("DEEPSEEK_BASE_URL", DEEPSEEK_DEFAULT_BASE_URL),
                "model": os.getenv("DEEPSEEK_MODEL", DEEPSEEK_DEFAULT_MODEL),
            },
            "fridge": {
                "data_dir": str(fridge_data_dir()),
            },
        }

    def _read_json_body(self) -> dict[str, Any]:
        content_type = self.headers.get("Content-Type", "")
        if content_type and not content_type.startswith("application/json"):
            raise InvalidRequestError("Request body must be application/json.")
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)
        if not raw_body:
            return {}
        parsed = json.loads(raw_body.decode("utf-8"))
        if not isinstance(parsed, dict):
            raise InvalidRequestError("JSON body must be an object.")
        return parsed

    def _send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, code: str, message: str, status: int = 400) -> None:
        self._send_json(
            {
                "success": False,
                "error": {
                    "code": code,
                    "message": message,
                    "recoverable": status < 500,
                },
            },
            status=status,
        )


def _item_id_from_path(path: str) -> str | None:
    match = re.fullmatch(r"/api/fridge/items/([^/]+)", path)
    return match.group(1) if match else None


def _memory_project_id_from_path(path: str) -> str | None:
    match = re.fullmatch(r"/api/memory/projects/([^/]+)", path)
    return match.group(1) if match else None


def _memory_project_child_id_from_path(path: str, child: str) -> str | None:
    match = re.fullmatch(rf"/api/memory/projects/([^/]+)/{child}", path)
    return match.group(1) if match else None


def _memory_entity_id_from_path(path: str, entity: str) -> str | None:
    match = re.fullmatch(rf"/api/memory/{entity}/([^/]+)", path)
    return match.group(1) if match else None


def update_env_file(path: Path, updates: dict[str, str]) -> None:
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    remaining = dict(updates)
    next_lines: list[str] = []

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            next_lines.append(line)
            continue

        key, _value = line.split("=", 1)
        normalized_key = key.strip()
        if normalized_key in remaining:
            next_lines.append(f"{normalized_key}={remaining.pop(normalized_key)}")
        else:
            next_lines.append(line)

    for key, value in remaining.items():
        next_lines.append(f"{key}={value}")

    path.write_text("\n".join(next_lines).rstrip() + "\n", encoding="utf-8")


def run(host: str = "127.0.0.1", port: int = 8787) -> None:
    load_env_files(PROJECT_ROOT / ".env.local", PROJECT_ROOT / ".env")
    CalendarBackendHandler.analyzer = ReceiptAnalyzer()
    CalendarBackendHandler.inventory_store = FridgeInventoryStore()
    CalendarBackendHandler.memory_service = LongTermMemoryService()
    server = HTTPServer((host, port), CalendarBackendHandler)
    print(f"Calendar backend listening on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run()
