//! Conditional logging macros that check a module-level `ENABLE_LOGS` flag.
//!
//! Usage:
//! ```rust
//! // In your module, define the flag first:
//! const ENABLE_LOGS: bool = true;
//!
//! // Then use the macros (they're exported at the crate root):
//! use crate::{log_info, log_warn, log_error};
//!
//! log_info!("This will log if ENABLE_LOGS is true");
//! ```

/// Macro for conditional info logging.
/// Checks the `ENABLE_LOGS` const in the calling module.
/// 
/// Each module that uses this macro must define:
/// ```rust
/// const ENABLE_LOGS: bool = true; // or false
/// ```
#[macro_export]
macro_rules! log_info {
    ($($arg:tt)*) => {
        if ENABLE_LOGS {
            log::info!($($arg)*);
        }
    };
}

/// Macro for conditional warn logging.
/// Checks the `ENABLE_LOGS` const in the calling module.
/// 
/// Each module that uses this macro must define:
/// ```rust
/// const ENABLE_LOGS: bool = true; // or false
/// ```
#[macro_export]
macro_rules! log_warn {
    ($($arg:tt)*) => {
        if ENABLE_LOGS {
            log::warn!($($arg)*);
        }
    };
}

/// Macro for conditional error logging.
/// Checks the `ENABLE_LOGS` const in the calling module.
/// 
/// Each module that uses this macro must define:
/// ```rust
/// const ENABLE_LOGS: bool = true; // or false
/// ```
#[macro_export]
macro_rules! log_error {
    ($($arg:tt)*) => {
        if ENABLE_LOGS {
            log::error!($($arg)*);
        }
    };
}

