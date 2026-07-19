from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules


ROOT = Path(SPECPATH)
hidden_imports = collect_submodules("backend")
datas = [
    (str(ROOT / "backend" / "calendar" / "migrations"), "backend/calendar/migrations"),
    (str(ROOT / "backend" / "data" / "shelf_life_defaults.json"), "backend/data"),
]

a = Analysis(
    [str(ROOT / "backend_sidecar.py")],
    pathex=[str(ROOT)],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="calendar-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    # Tauri's shell plugin starts sidecars with CREATE_NO_WINDOW on Windows.
    # Keep the console bootloader so Python/Uvicorn receive valid stdio handles
    # without showing a console window to desktop users.
    console=True,
)
