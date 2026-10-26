use std::time::{Duration, Instant};
use tauri::{Monitor, WebviewWindow};

// macOS monitor positions are scaled with the *target* screen's backing scale.
// Passing them as physical window coordinates uses the window's old screen scale.
fn logical_position(x: i32, y: i32, scale: f64) -> tauri::LogicalPosition<f64> {
    tauri::LogicalPosition::new(x as f64 / scale, y as f64 / scale)
}

fn near(a: f64, b: f64) -> bool { (a - b).abs() <= 2.0 }

fn wait_until(mut ready: impl FnMut() -> Result<bool, String>, message: &str) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        if ready()? { return Ok(()); }
        if Instant::now() >= deadline { return Err(message.to_owned()); }
        // This runs on a blocking worker, never the AppKit/event-loop thread.
        std::thread::sleep(Duration::from_millis(40));
    }
}

// Only this window is raised above the menu bar on its own screen. Never change
// NSApplication presentationOptions: those would also hide the editor's Dock.
#[cfg(target_os = "macos")]
fn fill_screen_without_hiding_dock(window: &WebviewWindow) -> Result<(), String> {
    let (send, receive) = std::sync::mpsc::sync_channel(1);
    let native_window = window.clone();
    window.run_on_main_thread(move || {
        let result = (|| {
            let pointer = native_window.ns_window().map_err(|e| e.to_string())?;
            // Tauri owns this NSWindow; access it only on the AppKit main thread
            // and do not retain the borrowed pointer beyond this callback.
            let native = unsafe { (pointer as *const objc2_app_kit::NSWindow).as_ref() }
                .ok_or("발표 창을 찾을 수 없습니다.")?;
            let screen = native.screen().ok_or("발표 디스플레이를 찾을 수 없습니다.")?;
            native.setFrame_display(screen.frame(), true);
            native.setLevel(objc2_app_kit::NSMainMenuWindowLevel + 1);
            native.setHidesOnDeactivate(false);
            Ok(())
        })();
        let _ = send.send(result);
    }).map_err(|e| e.to_string())?;
    receive.recv_timeout(Duration::from_secs(3))
        .map_err(|_| "발표 화면 배치가 완료되지 않았습니다.".to_owned())?
}

pub async fn configure(window: WebviewWindow, main: WebviewWindow, monitor: Monitor) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target = logical_position(monitor.position().x, monitor.position().y, monitor.scale_factor());
        #[cfg(target_os = "macos")]
        window.set_position(target).map_err(|e| e.to_string())?;
        #[cfg(not(target_os = "macos"))]
        window.set_position(*monitor.position()).map_err(|e| e.to_string())?;

        // set_position() only enqueues the AppKit move. Do not enter fullscreen
        // until both the screen and actual window coordinates confirm it completed.
        wait_until(|| {
            let Some(actual) = window.current_monitor().map_err(|e| e.to_string())? else { return Ok(false) };
            if actual.position() != monitor.position() { return Ok(false); }
            let position = window.outer_position().map_err(|e| e.to_string())?;
            #[cfg(target_os = "macos")]
            {
                let position = position.to_logical::<f64>(window.scale_factor().map_err(|e| e.to_string())?);
                Ok(near(position.x, target.x) && near(position.y, target.y))
            }
            #[cfg(not(target_os = "macos"))]
            { Ok(near(position.x as f64, monitor.position().x as f64) && near(position.y as f64, monitor.position().y as f64)) }
        }, "발표 창을 다른 디스플레이로 이동하지 못했습니다. 디스플레이 연결과 배치를 확인해주세요.")?;

        // macOS: a borderless screen-sized window preserves the editor's Dock.
        // Set its native frame synchronously, after the monitor move has settled.
        #[cfg(target_os = "macos")]
        fill_screen_without_hiding_dock(&window)?;
        #[cfg(not(target_os = "macos"))]
        window.set_fullscreen(true).map_err(|e| e.to_string())?;

        wait_until(|| {
            let Some(actual) = window.current_monitor().map_err(|e| e.to_string())? else { return Ok(false) };
            let size = window.inner_size().map_err(|e| e.to_string())?;
            Ok(actual.position() == monitor.position()
                && near(size.width as f64, actual.size().width as f64)
                && near(size.height as f64, actual.size().height as f64))
        }, "발표 화면을 디스플레이 크기로 확대하지 못했습니다. 다시 시도해주세요.")?;

        window.show().map_err(|e| e.to_string())?;
        main.set_focus().map_err(|e| e.to_string())?;
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn external_display_coordinates_use_target_scale() {
        // A 1× screen to the right of a 2× laptop: using the laptop's scale
        // would put the new window at x=756, still on the laptop.
        let position = logical_position(1512, 0, 1.0);
        assert_eq!((position.x, position.y), (1512.0, 0.0));
        let retina = logical_position(3840, 0, 2.0);
        assert_eq!((retina.x, retina.y), (1920.0, 0.0));
    }

    #[test]
    fn screens_left_and_above_keep_negative_coordinates() {
        let position = logical_position(-3840, -2160, 2.0);
        assert_eq!((position.x, position.y), (-1920.0, -1080.0));
    }

    #[test]
    fn waits_for_observed_completion_not_command_submission() {
        let mut observations = 0;
        wait_until(|| { observations += 1; Ok(observations == 3) }, "not ready").unwrap();
        assert_eq!(observations, 3);
    }

    #[test]
    fn closed_window_errors_stop_the_transition() {
        assert_eq!(wait_until(|| Err("window closed".into()), "timeout").unwrap_err(), "window closed");
    }
}
