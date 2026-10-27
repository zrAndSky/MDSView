use std::{
    collections::HashSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
    sync::OnceLock,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;

const AUTOSAVE_BRANCH: &str = "autosave";
const BIG_LINES: u32 = 20;
const MAX_INTERVAL_SECONDS: i64 = 300;
const DEFAULT_HISTORY_LIMIT: u32 = 100;
const MAX_HISTORY_LIMIT: u32 = 500;
const MAX_DIFF_BYTES: usize = 2 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHistoryEntry {
    pub sha: String,
    pub time: i64,
    pub subject: String,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHistoryResponse {
    pub repo_root: String,
    pub entries: Vec<GitHistoryEntry>,
    pub latest_sha: Option<String>,
    pub working_dirty: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSnapshotResult {
    pub status: String,
    pub sha: Option<String>,
    pub lines: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHistorySize {
    pub snapshots: u32,
    pub bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCleanResult {
    pub removed: u32,
    pub snapshots: u32,
    pub bytes: u64,
    pub gc_ok: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHistoryDiff {
    pub diff: String,
    pub old_text: String,
    pub new_text: String,
}

struct CommitIdent {
    author_name: String,
    author_email: String,
    author_date: String,
    committer_name: String,
    committer_email: String,
    committer_date: String,
    message: String,
}

#[tauri::command]
pub async fn git_repo_root(path: String) -> Result<Option<String>, String> {
    run_blocking(move || {
        let file = existing_path(&path)?;
        Ok(find_repo_root(&file)?.map(|root| root.to_string_lossy().to_string()))
    })
    .await
}

#[tauri::command]
pub async fn git_history_list(path: String, limit: Option<u32>) -> Result<GitHistoryResponse, String> {
    run_blocking(move || history_list(&path, limit.unwrap_or(DEFAULT_HISTORY_LIMIT))).await
}

#[tauri::command]
pub async fn git_history_diff(path: String, sha: String, mode: String) -> Result<GitHistoryDiff, String> {
    run_blocking(move || history_diff(&path, &sha, &mode)).await
}

#[tauri::command]
pub async fn git_snapshot(path: String, force: Option<bool>) -> Result<GitSnapshotResult, String> {
    run_blocking(move || {
        let file = existing_path(&path)?;
        let root = find_repo_root(&file)?.ok_or_else(|| "该文件不在 git 仓库内".to_string())?;
        snapshot_repo(&root, force.unwrap_or(false))
    })
    .await
}

#[tauri::command]
pub async fn git_restore(path: String, sha: String) -> Result<(), String> {
    run_blocking(move || restore_file(&path, &sha)).await
}

#[tauri::command]
pub async fn git_history_size(path: String) -> Result<GitHistorySize, String> {
    run_blocking(move || {
        let file = existing_path(&path)?;
        let root = find_repo_root(&file)?.ok_or_else(|| "该文件不在 git 仓库内".to_string())?;
        history_size(&root)
    })
    .await
}

#[tauri::command]
pub async fn git_history_clean(path: String, delete: Vec<String>) -> Result<GitCleanResult, String> {
    run_blocking(move || clean_history(&path, &delete)).await
}

async fn run_blocking<T, F>(work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| format!("后台任务失败：{error}"))?
}

fn configure_background_command(command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
}

fn git_program() -> &'static PathBuf {
    static GIT: OnceLock<PathBuf> = OnceLock::new();
    GIT.get_or_init(|| {
        let candidates = [
            "git".to_string(),
            r"C:\Program Files\Git\cmd\git.exe".to_string(),
            r"C:\Program Files\Git\bin\git.exe".to_string(),
        ];
        for candidate in candidates {
            let mut command = Command::new(&candidate);
            configure_background_command(&mut command);
            let ok = command
                .arg("--version")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .map(|status| status.success())
                .unwrap_or(false);
            if ok {
                return PathBuf::from(candidate);
            }
        }
        PathBuf::from("git")
    })
}

fn arg_list(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| value.to_string()).collect()
}

macro_rules! git_args {
    ($($value:expr),* $(,)?) => {
        vec![$($value.to_string()),*]
    };
}

fn git_output(repo: &Path, args: &[String]) -> Result<Output, String> {
    let mut command = Command::new(git_program());
    configure_background_command(&mut command);
    command
        .arg("-C")
        .arg(repo)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("无法运行 git：{error}"))
}

fn git_text(repo: &Path, args: &[String]) -> Result<String, String> {
    let output = git_output(repo, args)?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim_end().to_string())
}

fn git_ok(repo: &Path, args: &[String]) -> bool {
    git_output(repo, args).map(|output| output.status.success()).unwrap_or(false)
}

fn clean_path(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    let trimmed = text
        .strip_prefix(r"\\?\")
        .or_else(|| text.strip_prefix(r"\??\"))
        .unwrap_or(&text);
    PathBuf::from(trimmed)
}

fn existing_path(value: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(value);
    let canonical = fs::canonicalize(&path).map_err(|_| "文件不存在".to_string())?;
    Ok(clean_path(&canonical))
}

fn find_repo_root(path: &Path) -> Result<Option<PathBuf>, String> {
    let start = if path.is_dir() {
        path.to_path_buf()
    } else {
        path.parent().unwrap_or(path).to_path_buf()
    };
    let mut command = Command::new(git_program());
    configure_background_command(&mut command);
    let output = command
        .arg("-C")
        .arg(&start)
        .args(["rev-parse", "--show-toplevel"])
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("无法运行 git：{error}"))?;
    if !output.status.success() {
        return Ok(None);
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        return Ok(None);
    }
    let root = fs::canonicalize(&text).map_err(|error| error.to_string())?;
    Ok(Some(clean_path(&root)))
}

fn relative_path(root: &Path, file: &Path) -> Result<String, String> {
    let relative = file
        .strip_prefix(root)
        .map_err(|_| "文件不在仓库目录内".to_string())?;
    Ok(relative.to_string_lossy().replace('\\', "/"))
}

fn valid_sha(value: &str) -> bool {
    (7..=40).contains(&value.len()) && value.chars().all(|character| character.is_ascii_hexdigit())
}

fn autosave_ref() -> String {
    format!("refs/heads/{AUTOSAVE_BRANCH}")
}

fn other_refs(root: &Path) -> Result<Vec<String>, String> {
    let text = git_text(root, &git_args![
        "for-each-ref",
        "--format=%(refname)",
        "refs/heads",
        "refs/tags",
        "refs/remotes",
    ])?;
    let own = autosave_ref();
    Ok(text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && *line != own)
        .map(str::to_string)
        .collect())
}

fn rev_list(root: &Path, base_args: &[&str], with_paths: bool) -> Result<Vec<String>, String> {
    let mut args = arg_list(base_args);
    args.push(autosave_ref());
    let others = other_refs(root)?;
    if !others.is_empty() {
        args.push("--not".to_string());
        args.extend(others);
    }
    let text = git_text(root, &args)?;
    Ok(text
        .lines()
        .filter_map(|line| {
            let first = line.split_whitespace().next().unwrap_or("");
            if first.is_empty() {
                None
            } else if with_paths {
                Some(line.to_string())
            } else {
                Some(first.to_string())
            }
        })
        .collect())
}

fn snapshot_repo(root: &Path, force: bool) -> Result<GitSnapshotResult, String> {
    if !git_ok(root, &git_args!["rev-parse", "--verify", "HEAD"]) {
        return Err("仓库还没有任何提交".to_string());
    }

    let temp = tempfile::tempdir().map_err(|error| error.to_string())?;
    let index_path = temp.path().join("index");
    let index = index_path.to_string_lossy().to_string();

    let run_index = |args: &[String]| -> Result<Output, String> {
        let mut command = Command::new(git_program());
        configure_background_command(&mut command);
        command
            .arg("-C")
            .arg(root)
            .args(args)
            .env("GIT_INDEX_FILE", &index)
            .env("GIT_TERMINAL_PROMPT", "0")
            .env_remove("GIT_DIR")
            .env_remove("GIT_WORK_TREE")
            .stdin(Stdio::null())
            .output()
            .map_err(|error| format!("无法运行 git：{error}"))
    };

    let read = run_index(&git_args!["read-tree", "HEAD"])?;
    if !read.status.success() {
        return Err(String::from_utf8_lossy(&read.stderr).trim().to_string());
    }
    let add = run_index(&git_args!["add", "-A"])?;
    if !add.status.success() {
        return Err(String::from_utf8_lossy(&add.stderr).trim().to_string());
    }
    let tree = run_index(&git_args!["write-tree"])?;
    if !tree.status.success() {
        return Err(String::from_utf8_lossy(&tree.stderr).trim().to_string());
    }
    let tree = String::from_utf8_lossy(&tree.stdout).trim().to_string();

    let reference = autosave_ref();
    let old_ref = git_output(root, &git_args!["rev-parse", "--verify", "-q", &reference])?;
    let old = if old_ref.status.success() {
        Some(String::from_utf8_lossy(&old_ref.stdout).trim().to_string())
    } else {
        None
    };

    let mut lines = 0;
    if let Some(old_ref) = &old {
        let old_tree = git_text(root, &git_args!["rev-parse", &format!("{old_ref}^{{tree}}")])?;
        if old_tree == tree {
            return Ok(GitSnapshotResult { status: "unchanged".to_string(), sha: None, lines: 0 });
        }

        lines = git_text(root, &git_args!["diff", "--numstat", &old_tree, &tree])
            .map(|text| parse_numstat_total(&text))
            .unwrap_or(0);
        let structural = git_text(root, &git_args!["diff", "--name-status", &old_tree, &tree])
            .map(|text| text.lines().any(|line| {
                line.starts_with('A') || line.starts_with('D') || line.starts_with('R')
            }))
            .unwrap_or(false);
        let last_time = git_text(root, &git_args!["log", "-1", "--format=%ct", old_ref])
            .ok()
            .and_then(|text| text.trim().parse::<i64>().ok())
            .unwrap_or(0);
        let now = now_seconds();
        if !force && !structural && lines < BIG_LINES && now - last_time < MAX_INTERVAL_SECONDS {
            return Ok(GitSnapshotResult { status: "held".to_string(), sha: None, lines });
        }
    }

    let commit = commit_tree(root, &tree, old.as_deref(), "autosave", None)?;
    let updated = match &old {
        Some(old_ref) => git_ok(root, &git_args!["update-ref", &reference, &commit, old_ref]),
        None => git_ok(root, &git_args!["update-ref", &reference, &commit]),
    };
    if !updated {
        return Ok(GitSnapshotResult { status: "conflict".to_string(), sha: None, lines });
    }

    Ok(GitSnapshotResult { status: "snapshot".to_string(), sha: Some(commit), lines })
}

fn now_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

fn parse_numstat_total(text: &str) -> u32 {
    text.lines()
        .filter_map(|line| {
            let mut parts = line.split('\t');
            let added = parts.next()?;
            let removed = parts.next()?;
            let added = added.parse::<u32>().ok()?;
            let removed = removed.parse::<u32>().ok()?;
            Some(added + removed)
        })
        .sum()
}

fn commit_tree(
    root: &Path,
    tree: &str,
    parent: Option<&str>,
    message: &str,
    ident: Option<&CommitIdent>,
) -> Result<String, String> {
    let mut command = Command::new(git_program());
    configure_background_command(&mut command);
    command.arg("-C").arg(root).args(["commit-tree", tree]);
    if let Some(parent) = parent {
        command.arg("-p").arg(parent);
    }
    match ident {
        Some(ident) => {
            command.env("GIT_AUTHOR_NAME", &ident.author_name);
            command.env("GIT_AUTHOR_EMAIL", &ident.author_email);
            command.env("GIT_AUTHOR_DATE", &ident.author_date);
            command.env("GIT_COMMITTER_NAME", &ident.committer_name);
            command.env("GIT_COMMITTER_EMAIL", &ident.committer_email);
            command.env("GIT_COMMITTER_DATE", &ident.committer_date);
        }
        None => {
            command.env("GIT_AUTHOR_NAME", "MDSView");
            command.env("GIT_AUTHOR_EMAIL", "mdsview@localhost");
            command.env("GIT_COMMITTER_NAME", "MDSView");
            command.env("GIT_COMMITTER_EMAIL", "mdsview@localhost");
        }
    }
    command.env("GIT_TERMINAL_PROMPT", "0");
    command.arg("-m").arg(message);
    let output = command.output().map_err(|error| format!("无法运行 git：{error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn history_list(path: &str, limit: u32) -> Result<GitHistoryResponse, String> {
    let file = existing_path(path)?;
    let root = find_repo_root(&file)?.ok_or_else(|| "该文件不在 git 仓库内".to_string())?;
    let relative = relative_path(&root, &file)?;
    let reference = autosave_ref();
    let repo_root = root.to_string_lossy().to_string();

    if !git_ok(&root, &git_args!["rev-parse", "--verify", "-q", &reference]) {
        return Ok(GitHistoryResponse {
            repo_root,
            entries: Vec::new(),
            latest_sha: None,
            working_dirty: false,
        });
    }

    let limit = limit.clamp(1, MAX_HISTORY_LIMIT);
    let text = git_text(&root, &git_args![
        "log",
        "-n",
        &limit.to_string(),
        "--follow",
        "--format=%H%x09%ct%x09%s",
        "--numstat",
        &reference,
        "--",
        &relative,
    ])?;

    let mut entries: Vec<GitHistoryEntry> = Vec::new();
    let mut current: Option<usize> = None;
    for line in text.lines() {
        if line.is_empty() {
            continue;
        }
        let first = line.split('\t').next().unwrap_or("");
        if first.len() == 40 && first.chars().all(|character| character.is_ascii_hexdigit()) {
            let mut parts = line.splitn(3, '\t');
            let sha = parts.next().unwrap_or("").to_string();
            let time = parts.next().and_then(|value| value.parse::<i64>().ok()).unwrap_or(0);
            let subject = parts.next().unwrap_or("").to_string();
            entries.push(GitHistoryEntry { sha, time, subject, additions: 0, deletions: 0 });
            current = Some(entries.len() - 1);
            continue;
        }
        if let Some(index) = current {
            let mut parts = line.split('\t');
            let added = parts.next().and_then(|value| value.parse::<u32>().ok()).unwrap_or(0);
            let removed = parts.next().and_then(|value| value.parse::<u32>().ok()).unwrap_or(0);
            if let Some(entry) = entries.get_mut(index) {
                entry.additions = entry.additions.saturating_add(added);
                entry.deletions = entry.deletions.saturating_add(removed);
            }
        }
    }

    let latest_sha = entries.first().map(|entry| entry.sha.clone());
    let working_dirty = match &latest_sha {
        Some(sha) => working_file_differs(&root, &file, &relative, sha).unwrap_or(true),
        None => false,
    };

    Ok(GitHistoryResponse { repo_root, entries, latest_sha, working_dirty })
}

fn working_file_differs(
    root: &Path,
    file: &Path,
    relative: &str,
    sha: &str,
) -> Result<bool, String> {
    let snapshot_hash = git_output(root, &git_args!["rev-parse", &format!("{sha}:{relative}")])?;
    if !snapshot_hash.status.success() {
        return Ok(true);
    }
    let snapshot_hash = String::from_utf8_lossy(&snapshot_hash.stdout).trim().to_string();

    let file_text = file.to_string_lossy().to_string();
    let work_hash = git_output(root, &git_args![
        "hash-object",
        &format!("--path={relative}"),
        "--",
        &file_text,
    ])?;
    if !work_hash.status.success() {
        return Ok(true);
    }
    let work_hash = String::from_utf8_lossy(&work_hash.stdout).trim().to_string();
    Ok(work_hash != snapshot_hash)
}

fn truncate_utf8(text: &mut String, limit: usize) {
    if text.len() <= limit {
        return;
    }
    let mut end = limit;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    text.truncate(end);
}

fn read_blob(root: &Path, rev: &str, relative: &str) -> String {
    let spec = format!("{rev}:{relative}");
    match git_output(root, &git_args!["show", &spec]) {
        Ok(output) if output.status.success() => {
            let mut text = String::from_utf8_lossy(&output.stdout).replace("\r\n", "\n");
            truncate_utf8(&mut text, MAX_DIFF_BYTES);
            text
        }
        _ => String::new(),
    }
}

fn history_diff(path: &str, sha: &str, mode: &str) -> Result<GitHistoryDiff, String> {
    if !valid_sha(sha) {
        return Err("无效的快照编号".to_string());
    }
    let file = existing_path(path)?;
    let root = find_repo_root(&file)?.ok_or_else(|| "该文件不在 git 仓库内".to_string())?;
    let relative = relative_path(&root, &file)?;
    if !git_ok(&root, &git_args!["cat-file", "-e", &format!("{sha}^{{commit}}")]) {
        return Err("找不到该快照".to_string());
    }

    let (old_text, new_text) = match mode {
        "current" => {
            let old_text = read_blob(&root, sha, &relative);
            let new_text = fs::read_to_string(&file)
                .map(|text| text.replace("\r\n", "\n"))
                .unwrap_or_default();
            (old_text, new_text)
        }
        _ => {
            let parent = git_output(&root, &git_args!["rev-parse", "--verify", &format!("{sha}^")])
                .ok()
                .filter(|output| output.status.success())
                .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string());
            let old_text = parent
                .as_deref()
                .map(|commit| read_blob(&root, commit, &relative))
                .unwrap_or_default();
            (old_text, read_blob(&root, sha, &relative))
        }
    };

    let args = match mode {
        "current" => git_args!["diff", "--no-ext-diff", "--unified=3", sha, "--", &relative],
        _ => git_args!["show", "--no-ext-diff", "--format=", "--unified=3", sha, "--", &relative],
    };
    let output = git_output(&root, &args)?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let mut diff = String::from_utf8_lossy(&output.stdout).to_string();
    if diff.len() > MAX_DIFF_BYTES {
        truncate_utf8(&mut diff, MAX_DIFF_BYTES);
        diff.push_str("\n… diff 太长，已截断");
    }
    Ok(GitHistoryDiff { diff, old_text, new_text })
}

fn restore_file(path: &str, sha: &str) -> Result<(), String> {
    if !valid_sha(sha) {
        return Err("无效的快照编号".to_string());
    }
    let file = existing_path(path)?;
    let root = find_repo_root(&file)?.ok_or_else(|| "该文件不在 git 仓库内".to_string())?;
    let relative = relative_path(&root, &file)?;
    if !git_ok(&root, &git_args!["cat-file", "-e", &format!("{sha}^{{commit}}")]) {
        return Err("找不到该快照".to_string());
    }
    if !git_ok(&root, &git_args!["rev-parse", "--verify", "HEAD"]) {
        return Err("仓库还没有任何提交".to_string());
    }

    match snapshot_repo(&root, true) {
        Ok(result) if result.status == "conflict" => {
            return Err("保存当前状态时 autosave 分支被其他进程更新，已取消回滚".to_string())
        }
        Ok(_) => {}
        Err(error) => return Err(format!("无法保存当前状态，已取消回滚：{error}")),
    }

    let restore = git_output(&root, &git_args![
        "restore",
        "--source",
        sha,
        "--worktree",
        "--",
        &relative,
    ])?;
    if !restore.status.success() {
        let fallback = git_output(&root, &git_args!["checkout", sha, "--", &relative])?;
        if !fallback.status.success() {
            return Err(String::from_utf8_lossy(&fallback.stderr).trim().to_string());
        }
    }
    Ok(())
}

fn history_size(root: &Path) -> Result<GitHistorySize, String> {
    let reference = autosave_ref();
    if !git_ok(root, &git_args!["rev-parse", "--verify", "-q", &reference]) {
        return Ok(GitHistorySize { snapshots: 0, bytes: 0 });
    }

    let commits = rev_list(root, &["rev-list"], false)?;
    let objects = rev_list(root, &["rev-list", "--objects"], true)?;
    let mut bytes = 0u64;
    if !objects.is_empty() {
        let mut command = Command::new(git_program());
        configure_background_command(&mut command);
        let mut child = command
            .arg("-C")
            .arg(root)
            .args(["cat-file", "--batch-check=%(objectsize)"])
            .env("GIT_TERMINAL_PROMPT", "0")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| format!("无法运行 git：{error}"))?;
        if let Some(mut stdin) = child.stdin.take() {
            for object in &objects {
                if let Some(id) = object.split_whitespace().next() {
                    let _ = writeln!(stdin, "{id}");
                }
            }
        }
        let output = child.wait_with_output().map_err(|error| error.to_string())?;
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            if let Ok(size) = line.trim().parse::<u64>() {
                bytes = bytes.saturating_add(size);
            }
        }
    }

    Ok(GitHistorySize { snapshots: commits.len() as u32, bytes })
}

fn clean_history(path: &str, delete: &[String]) -> Result<GitCleanResult, String> {
    let file = existing_path(path)?;
    let root = find_repo_root(&file)?.ok_or_else(|| "该文件不在 git 仓库内".to_string())?;
    let reference = autosave_ref();
    if !git_ok(&root, &git_args!["rev-parse", "--verify", "-q", &reference]) {
        return Err("该仓库还没有快照".to_string());
    }

    let delete_set: HashSet<String> = delete
        .iter()
        .filter(|sha| valid_sha(sha))
        .map(|sha| sha.to_lowercase())
        .collect();
    if delete_set.is_empty() {
        return Err("没有选择要删除的快照".to_string());
    }

    let mut chain = rev_list(&root, &["rev-list", "--reverse"], false)?;
    let chain_set: HashSet<String> = chain.iter().cloned().collect();
    if let Some(unknown) = delete_set.iter().find(|sha| !chain_set.contains(*sha)) {
        return Err(format!("快照 {unknown} 不在 autosave 分支上"));
    }

    let old_tip = git_text(&root, &git_args!["rev-parse", &reference])?;
    let mut previous: Option<String> = None;
    let mut new_tip: Option<String> = None;
    let mut removed = 0u32;

    for (index, sha) in chain.drain(..).enumerate() {
        if delete_set.contains(&sha) {
            removed += 1;
            continue;
        }
        let tree = git_text(&root, &git_args!["rev-parse", &format!("{sha}^{{tree}}")])?;
        let ident = read_commit_ident(&root, &sha)?;
        let parent = if let Some(previous) = &previous {
            Some(previous.clone())
        } else if index == 0 {
            original_parent(&root, &sha, &chain_set)?
        } else {
            None
        };
        let commit = commit_tree(&root, &tree, parent.as_deref(), &ident.message, Some(&ident))?;
        previous = Some(commit.clone());
        new_tip = Some(commit);
    }

    if removed == 0 {
        let size = history_size(&root)?;
        return Ok(GitCleanResult {
            removed: 0,
            snapshots: size.snapshots,
            bytes: size.bytes,
            gc_ok: true,
        });
    }

    let updated = match &new_tip {
        Some(tip) => git_ok(&root, &git_args!["update-ref", &reference, tip, &old_tip]),
        None => git_ok(&root, &git_args!["update-ref", "-d", &reference, &old_tip]),
    };
    if !updated {
        return Err("清理过程中 autosave 分支被更新，请刷新后重试".to_string());
    }

    let _ = git_output(&root, &git_args![
        "reflog",
        "expire",
        "--expire=now",
        &reference,
    ]);
    let gc_ok = git_ok(&root, &git_args!["gc", "--prune=now", "--quiet"]);
    let size = history_size(&root)?;

    Ok(GitCleanResult {
        removed,
        snapshots: size.snapshots,
        bytes: size.bytes,
        gc_ok,
    })
}

fn original_parent(
    root: &Path,
    sha: &str,
    chain: &HashSet<String>,
) -> Result<Option<String>, String> {
    let text = git_text(root, &git_args!["rev-list", "--parents", "-n", "1", sha])?;
    let parent = text.split_whitespace().nth(1).map(str::to_string);
    Ok(match parent {
        Some(parent) if !chain.contains(&parent) => Some(parent),
        _ => None,
    })
}

fn read_commit_ident(root: &Path, sha: &str) -> Result<CommitIdent, String> {
    let raw = git_text(root, &git_args!["cat-file", "commit", sha])?;
    let (header, message) = raw.split_once("\n\n").unwrap_or((raw.as_str(), ""));
    let mut ident = CommitIdent {
        author_name: "MDSView".to_string(),
        author_email: "mdsview@localhost".to_string(),
        author_date: String::new(),
        committer_name: "MDSView".to_string(),
        committer_email: "mdsview@localhost".to_string(),
        committer_date: String::new(),
        message: message.trim().to_string(),
    };

    for line in header.lines() {
        if let Some(rest) = line.strip_prefix("author ") {
            if let Some((name, email, date)) = parse_ident(rest) {
                ident.author_name = name;
                ident.author_email = email;
                ident.author_date = date;
            }
        } else if let Some(rest) = line.strip_prefix("committer ") {
            if let Some((name, email, date)) = parse_ident(rest) {
                ident.committer_name = name;
                ident.committer_email = email;
                ident.committer_date = date;
            }
        }
    }

    if ident.author_date.is_empty() || ident.committer_date.is_empty() {
        return Err("无法读取快照的作者信息".to_string());
    }
    Ok(ident)
}

fn parse_ident(text: &str) -> Option<(String, String, String)> {
    let email_start = text.find('<')?;
    let email_end = text[email_start..].find('>')? + email_start;
    let name = text[..email_start].trim().to_string();
    let email = text[email_start + 1..email_end].trim().to_string();
    let date = text[email_end + 1..].trim().to_string();
    if name.is_empty() || email.is_empty() || date.is_empty() {
        return None;
    }
    Some((name, email, date))
}
