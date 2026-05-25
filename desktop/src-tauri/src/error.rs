use serde::{Serialize, Serializer};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("piicatcher executable not found: {0}")]
    PiicatcherNotFound(String),

    #[error("piicatcher exited with status {status}: {stderr}")]
    SubprocessFailed { status: i32, stderr: String },

    #[error("failed to parse piicatcher output: {0}")]
    ParseFailed(String),

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("{0}")]
    Generic(String),
}

// Serialize as a plain string so the React side gets a useful error message
// in `Error.message` instead of an opaque object.
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
