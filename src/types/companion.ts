export interface CompanionStatus {
  active: boolean;
  joinUrl: string | null;
  joinPin: string | null;
  connectedClients: number;
  port: number | null;
}
