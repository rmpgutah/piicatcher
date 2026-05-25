mod commands;
mod error;
mod piicatcher;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            health,
            list_sources,
            add_sqlite_source,
            add_network_source,
            remove_source,
            run_scan,
            pick_sqlite_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
