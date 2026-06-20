use tauri::{Manager, WindowEvent};

#[cfg(not(debug_assertions))]
use tauri::RunEvent;

#[cfg(not(debug_assertions))]
use std::sync::Mutex;

#[cfg(not(debug_assertions))]
struct SidecarChild(Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

#[cfg(not(debug_assertions))]
fn cleanup_sidecar(app: &tauri::AppHandle) {
    if let Some(child) = app.state::<SidecarChild>().0.lock().unwrap().take() {
        let _ = child.kill();
    }
}

pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_shell::init());

    #[cfg(not(debug_assertions))]
    let builder = builder.manage(SidecarChild(Mutex::new(None)));

    #[cfg(not(debug_assertions))]
    let builder = builder.setup(|app| {
        use tauri_plugin_shell::ShellExt;

        let port = portpicker::pick_unused_port().expect("no free port found");
        let handle = app.handle().clone();

        // Resolve bundled resource paths.
        let resource_dir = handle
            .path()
            .resource_dir()
            .expect("failed to resolve resource dir");
        let server_ts = resource_dir.join("server.ts");
        let server_ts_arg = server_ts.to_string_lossy().to_string();
        let dist_server_dir = resource_dir.join("server");
        let dist_client_dir = resource_dir.join("client");

        // App data directory for SQLite.
        let app_data_dir = handle
            .path()
            .app_data_dir()
            .expect("failed to resolve app data dir");
        std::fs::create_dir_all(&app_data_dir).ok();

        let (mut rx, child) = handle
            .shell()
            .sidecar("bun")
            .expect("failed to create sidecar command")
            .args([server_ts_arg])
            .env("PORT", port.to_string())
            .env("EMAIL_DATA_DIR", app_data_dir.to_string_lossy().to_string())
            .env(
                "DIST_SERVER_DIR",
                dist_server_dir.to_string_lossy().to_string(),
            )
            .env(
                "DIST_CLIENT_DIR",
                dist_client_dir.to_string_lossy().to_string(),
            )
            .spawn()
            .expect("failed to spawn sidecar");

        // Store the child handle for cleanup.
        *app.state::<SidecarChild>().0.lock().unwrap() = Some(child);

        // Watch stdout for the SERVER_READY signal.
        let window = app.get_webview_window("main").unwrap();
        tauri::async_runtime::spawn(async move {
            while let Some(event) = rx.recv().await {
                match event {
                    tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                        let line = String::from_utf8_lossy(&line);
                        if let Some(ready_port) = line.trim().strip_prefix("SERVER_READY:") {
                            let url = format!("http://localhost:{}", ready_port.trim());
                            let _ = window.navigate(url::Url::parse(&url).unwrap());
                            break;
                        }
                    }
                    tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                        let line = String::from_utf8_lossy(&line);
                        eprintln!("[sidecar stderr] {}", line);
                    }
                    _ => {}
                }
            }
        });

        Ok(())
    });

    let builder = builder.on_window_event(|window, event| {
        if window.label() != "main" {
            return;
        }

        if let WindowEvent::CloseRequested { .. } = event {
            window.app_handle().exit(0);
            return;
        }

        #[cfg(not(debug_assertions))]
        if let WindowEvent::Destroyed = event {
            cleanup_sidecar(&window.app_handle());
        }
    });

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app, _event| {
        #[cfg(not(debug_assertions))]
        if matches!(_event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
            cleanup_sidecar(_app);
        }
    });
}
