use std::path::PathBuf;

use crate::fs_utils::is_markdown_path;

pub(crate) fn collect_opened_files_from_args() -> Vec<PathBuf> {
    collect_opened_files_from(std::env::args().skip(1))
}

/// Shared by the single-instance callback, which receives its own argv.
pub(crate) fn collect_opened_files_from<I>(args: I) -> Vec<PathBuf>
where
    I: IntoIterator<Item = String>,
{
    args.into_iter()
        .filter(|arg| !arg.starts_with('-'))
        .filter_map(|arg| {
            if arg.starts_with("file://") {
                url::Url::parse(&arg).ok()?.to_file_path().ok()
            } else {
                Some(PathBuf::from(arg))
            }
        })
        .filter(|path| is_markdown_path(path))
        .collect()
}
