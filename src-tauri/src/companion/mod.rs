use std::{
    collections::HashSet,
    net::Ipv4Addr,
    sync::Arc,
};

use anyhow::{anyhow, Result};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::StatusCode,
    response::{Html, IntoResponse},
    routing::{get, post},
    Json, Router,
};
use local_ip_address::local_ip;
use serde::{Deserialize, Serialize};
use futures_util::future::{select, Either};
use futures_util::{SinkExt, StreamExt};
use tokio::{
    net::TcpListener,
    sync::{broadcast, oneshot, Mutex},
};
use uuid::Uuid;

use crate::{db::SessionInfo, timer::TimerController, timer::TimerSnapshot};

const PHONE_PAGE: &str = include_str!("phone.html");

#[derive(Clone)]
pub struct CompanionManager {
    inner: Arc<Mutex<CompanionState>>,
}

struct CompanionState {
    runtime: Option<CompanionRuntime>,
}

struct CompanionRuntime {
    join_pin: Arc<Mutex<String>>,
    join_url: String,
    port: u16,
    ws_tx: broadcast::Sender<String>,
    shutdown_tx: Option<oneshot::Sender<()>>,
    connected_clients: Arc<Mutex<usize>>,
}

#[derive(Clone)]
struct ServerState {
    join_pin: Arc<Mutex<String>>,
    ws_tx: broadcast::Sender<String>,
    connected_clients: Arc<Mutex<usize>>,
    active_tokens: Arc<Mutex<HashSet<String>>>,
    timer: TimerController,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct CompanionStatus {
    pub active: bool,
    pub join_url: Option<String>,
    pub join_pin: Option<String>,
    pub connected_clients: usize,
    pub port: Option<u16>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JoinRequest {
    pin: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JoinResponse {
    token: String,
    snapshot: TimerSnapshot,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActionRequest {
    token: String,
    action: String,
}

#[derive(Deserialize)]
struct WsQuery {
    token: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompanionEvent {
    event: String,
    payload: serde_json::Value,
}

impl CompanionManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(CompanionState { runtime: None })),
        }
    }

    pub async fn start_server(&self, timer: TimerController) -> Result<CompanionStatus> {
        let mut guard = self.inner.lock().await;
        if guard.runtime.is_some() {
            return self.current_status_locked(&guard).await;
        }

        let listener = TcpListener::bind("0.0.0.0:0").await?;
        let bound_addr = listener.local_addr()?;
        let port = bound_addr.port();
        let join_pin = Arc::new(Mutex::new(generate_pin()));
        let join_url = format!("http://{}:{}", best_lan_host_ip(), port);
        let (ws_tx, _) = broadcast::channel::<String>(128);
        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

        let connected_clients = Arc::new(Mutex::new(0usize));
        let active_tokens = Arc::new(Mutex::new(HashSet::<String>::new()));

        let router_state = ServerState {
            join_pin: join_pin.clone(),
            ws_tx: ws_tx.clone(),
            connected_clients: connected_clients.clone(),
            active_tokens,
            timer,
        };

        let app = Router::new()
            .route("/", get(phone_page))
            .route("/api/join", post(join_session))
            .route("/api/action", post(handle_action))
            .route("/ws", get(handle_ws_upgrade))
            .with_state(router_state);

        tokio::spawn(async move {
            let server = axum::serve(listener, app).with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            });
            if let Err(err) = server.await {
                log::error!("companion server stopped with error: {err}");
            }
        });

        guard.runtime = Some(CompanionRuntime {
            join_pin,
            join_url,
            port,
            ws_tx,
            shutdown_tx: Some(shutdown_tx),
            connected_clients,
        });

        self.current_status_locked(&guard).await
    }

    pub async fn stop_server(&self) {
        let mut guard = self.inner.lock().await;
        if let Some(mut runtime) = guard.runtime.take() {
            if let Some(shutdown_tx) = runtime.shutdown_tx.take() {
                let _ = shutdown_tx.send(());
            }
        }
    }

    pub async fn status(&self) -> CompanionStatus {
        let guard = self.inner.lock().await;
        self.current_status_locked(&guard).await.unwrap_or_default()
    }

    async fn current_status_locked(&self, guard: &CompanionState) -> Result<CompanionStatus> {
        if let Some(runtime) = &guard.runtime {
            let connected_clients = *runtime.connected_clients.lock().await;
            Ok(CompanionStatus {
                active: true,
                join_url: Some(runtime.join_url.clone()),
                join_pin: Some(runtime.join_pin.lock().await.clone()),
                connected_clients,
                port: Some(runtime.port),
            })
        } else {
            Ok(CompanionStatus::default())
        }
    }

    pub async fn rotate_pin(&self) -> Result<CompanionStatus> {
        let mut guard = self.inner.lock().await;
        let runtime = guard
            .runtime
            .as_mut()
            .ok_or_else(|| anyhow!("companion server is not running"))?;
        *runtime.join_pin.lock().await = generate_pin();
        let join_pin = runtime.join_pin.lock().await.clone();
        let connected_clients = *runtime.connected_clients.lock().await;
        let join_url = runtime.join_url.clone();
        let port = runtime.port;

        Ok(CompanionStatus {
            active: true,
            join_url: Some(join_url),
            join_pin: Some(join_pin),
            connected_clients,
            port: Some(port),
        })
    }

    pub async fn broadcast_timer_snapshot(&self, snapshot: &TimerSnapshot) {
        let payload = CompanionEvent {
            event: "timerSnapshot".into(),
            payload: serde_json::to_value(snapshot).unwrap_or_default(),
        };
        self.broadcast_event(payload).await;
    }

    pub async fn broadcast_session_completed(&self, session: &SessionInfo) {
        let payload = CompanionEvent {
            event: "sessionCompleted".into(),
            payload: serde_json::to_value(session).unwrap_or_default(),
        };
        self.broadcast_event(payload).await;
    }

    pub async fn stop_if_not_running(&self, snapshot: &TimerSnapshot) {
        if snapshot.state.status != crate::timer::TimerStatus::Running {
            self.stop_server().await;
        }
    }

    async fn broadcast_event(&self, event: CompanionEvent) {
        let guard = self.inner.lock().await;
        if let Some(runtime) = &guard.runtime {
            if let Ok(text) = serde_json::to_string(&event) {
                let _ = runtime.ws_tx.send(text);
            }
        }
    }
}

#[tauri::command]
pub async fn start_companion_server(
    state: tauri::State<'_, crate::AppState>,
) -> Result<CompanionStatus, String> {
    state
        .companion
        .start_server(state.timer.clone())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_companion_server(
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    state.companion.stop_server().await;
    Ok(())
}

#[tauri::command]
pub async fn get_companion_status(
    state: tauri::State<'_, crate::AppState>,
) -> Result<CompanionStatus, String> {
    Ok(state.companion.status().await)
}

#[tauri::command]
pub async fn rotate_companion_pin(
    state: tauri::State<'_, crate::AppState>,
) -> Result<CompanionStatus, String> {
    state.companion.rotate_pin().await.map_err(|e| e.to_string())
}

async fn phone_page() -> impl IntoResponse {
    Html(PHONE_PAGE.to_string())
}

async fn join_session(
    State(state): State<ServerState>,
    Json(req): Json<JoinRequest>,
) -> Result<Json<JoinResponse>, (StatusCode, String)> {
    let current_pin = state.join_pin.lock().await.clone();
    if req.pin != current_pin {
        return Err((StatusCode::UNAUTHORIZED, "Invalid PIN".to_string()));
    }
    let token = Uuid::new_v4().to_string();
    state.active_tokens.lock().await.insert(token.clone());
    let snapshot = state
        .timer
        .get_snapshot()
        .await;
    Ok(Json(JoinResponse { token, snapshot }))
}

async fn handle_action(
    State(state): State<ServerState>,
    Json(req): Json<ActionRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let has_token = state.active_tokens.lock().await.contains(&req.token);
    if !has_token {
        return Err((StatusCode::UNAUTHORIZED, "Invalid token".to_string()));
    }

    match req.action.as_str() {
        "end" => {
            state
                .timer
                .end_timer()
                .await
                .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
        }
        "cancel" => {
            state
                .timer
                .cancel_timer()
                .await
                .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
        }
        _ => return Err((StatusCode::BAD_REQUEST, "Unknown action".to_string())),
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn handle_ws_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<ServerState>,
    Query(query): Query<WsQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let has_token = state.active_tokens.lock().await.contains(&query.token);
    if !has_token {
        return Err((StatusCode::UNAUTHORIZED, "Invalid token".to_string()));
    }

    Ok(ws.on_upgrade(move |socket| ws_connected(socket, state)))
}

async fn ws_connected(socket: WebSocket, state: ServerState) {
    {
        let mut clients = state.connected_clients.lock().await;
        *clients += 1;
    }

    let mut rx = state.ws_tx.subscribe();
    let (mut sender, mut receiver) = socket.split();

    let recv_task = tokio::spawn(async move {
        while let Some(msg) = receiver.next().await {
            match msg {
                Ok(Message::Close(_)) | Err(_) => break,
                _ => {}
            }
        }
    });

    let send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if sender.send(Message::text(msg)).await.is_err() {
                break;
            }
        }
    });

    // `futures_util::select` owns both handles and returns the other — avoids `tokio::select!`
    // + `JoinHandle` borrow issues (rust-analyzer E0382 on sibling `.abort()`).
    match select(recv_task, send_task).await {
        Either::Left((_, send_task)) => {
            send_task.abort();
            let _ = send_task.await;
        }
        Either::Right((_, recv_task)) => {
            recv_task.abort();
            let _ = recv_task.await;
        }
    }

    {
        let mut clients = state.connected_clients.lock().await;
        *clients = clients.saturating_sub(1);
    }
}

fn generate_pin() -> String {
    let value: u32 = rand::random::<u32>() % 1_000_000;
    format!("{value:06}")
}

fn best_lan_host_ip() -> String {
    match local_ip() {
        Ok(ip) => ip.to_string(),
        Err(_) => Ipv4Addr::LOCALHOST.to_string(),
    }
}
