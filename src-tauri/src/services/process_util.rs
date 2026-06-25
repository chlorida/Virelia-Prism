use std::process::Command;

/// Spawn subprocesses without flashing a console window in Windows GUI builds.
pub fn hidden_command<S: AsRef<std::ffi::OsStr>>(program: S) -> Command {
    let mut cmd = Command::new(program);
    hide_subprocess_window(&mut cmd);
    cmd
}

pub fn hide_subprocess_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
}
