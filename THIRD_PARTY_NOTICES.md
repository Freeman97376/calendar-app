# Third-Party Notices

Calendar App includes or bundles the following third-party components. The exact JavaScript and Python versions used for a release are recorded in `package-lock.json`, `requirements-server.lock`, and `requirements-desktop.lock`; Rust versions are recorded in `src-tauri/Cargo.lock`.

| Component                                                                                                                                    | Purpose                                               | License                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| Tauri and Tauri plugins                                                                                                                      | Windows desktop shell and notifications               | Apache-2.0 OR MIT                                                            |
| Tesseract OCR                                                                                                                                | Receipt text recognition                              | Apache-2.0                                                                   |
| Leptonica                                                                                                                                    | Image processing used by Tesseract                    | BSD-2-Clause                                                                 |
| Python 3 and the Python sidecar                                                                                                              | Bundled API runtime                                   | PSF License Agreement plus component notices in the Python distribution      |
| FastAPI, Starlette, Uvicorn, SQLAlchemy, Alembic, PyMySQL, httpx, argon2-cffi, keyring, PyInstaller and their locked transitive dependencies | Sidecar server, storage, authentication and packaging | See each package metadata and the license files installed beside the package |
| React, Vite, Zustand, Zod, date-fns, dnd-kit and their locked transitive dependencies                                                        | User interface and build tooling                      | See each package's license in `node_modules` and npm package metadata        |

The packaged installer and portable ZIP include a `licenses` directory containing the Python license copied from the exact interpreter used for the build, the Apache-2.0 and Tauri MIT texts, Leptonica's BSD notice, and component-specific notices. Calendar App does not claim ownership of third-party components.

Legacy Firebase export is an operator-only development tool. Firebase is not imported by the production application bundle; its license remains available through the development dependency metadata.
