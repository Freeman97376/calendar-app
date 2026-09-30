"""Server-owned review state stored alongside the immutable assistant message."""
import copy
import hashlib

from sqlalchemy import select

from .database import ConversationMessageRecord, ConversationThreadRecord


OPERATIONS = ("apply", "copy_to_todos")


def new_review():
    return {"version": 1, "dismissed": False, "operations": {operation: {"status": "pending"} for operation in OPERATIONS}}


def plan_message(session, user_id, reference):
    if not isinstance(reference, dict) or not reference.get("threadId") or not reference.get("messageId"):
        raise ValueError("This AI plan has no saved reference. Refresh the app and generate a new plan.")
    thread = session.scalar(select(ConversationThreadRecord).where(
        ConversationThreadRecord.user_id == user_id,
        ConversationThreadRecord.thread_id == reference["threadId"],
        ConversationThreadRecord.kind == "assistant_chat",
    ).with_for_update())
    record = session.scalar(select(ConversationMessageRecord).where(
        ConversationMessageRecord.user_id == user_id,
        ConversationMessageRecord.thread_id == reference["threadId"],
        ConversationMessageRecord.message_id == reference["messageId"],
        ConversationMessageRecord.role == "assistant",
    ).with_for_update())
    if thread is None or record is None:
        raise KeyError("AI plan not found")
    body = copy.deepcopy(record.structured_json or {})
    review = body.get("actionPlanReview")
    if not isinstance(review, dict) or review.get("version") != 1:
        raise ValueError("Historical plan: execution status unknown. Generate a new plan to continue.")
    return record, thread, body, review


def operation_key(user_id, reference, operation):
    identity = "\0".join([user_id, reference["threadId"], reference["messageId"], operation])
    return "ai-plan-" + hashlib.sha256(identity.encode()).hexdigest()


def validate_actions(body, actions, operation):
    expected = (body.get("actionPlan") or {}).get("actions")
    if not isinstance(expected, list) or len(expected) != len(actions):
        raise ValueError("Submitted actions do not match the saved AI plan.")
    for original, action in zip(expected, actions):
        if not isinstance(original, dict) or not isinstance(action, dict):
            raise ValueError("AI plan actions must be objects.")
        if operation == "copy_to_todos":
            if action.get("type") != "create_todo":
                raise ValueError("Copying a plan can only create tasks.")
            continue
        if original.get("type") != action.get("type"):
            raise ValueError("Submitted action type differs from the saved AI plan.")
        for field in ("eventId", "todoId"):
            if field in original and original[field] != action.get(field):
                raise ValueError("Submitted action target differs from the saved AI plan.")
        values = action.get("event") or action.get("todo") or action.get("changes") or {}
        source = original.get("changes") or original
        for field in ("title", "startAt", "endAt", "dueDate", "description", "notes", "status", "priority", "etaMinutes", "energyNeeded", "eventTypeId", "allDay", "displayDetails"):
            if field in source and source[field] is not None and values.get(field) != source[field]:
                raise ValueError("Submitted action content differs from the saved AI plan.")
