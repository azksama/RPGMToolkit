pub mod bridge;
pub mod catalog;
pub mod codec;
pub mod game;
pub mod install;

pub type Result<T> = std::result::Result<T, String>;
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const LIMIT: usize = 64 * 1024 * 1024;
