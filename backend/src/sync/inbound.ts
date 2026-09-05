import type { SyncConfig } from "./config.js"
import db from "../db/database.js"
import { listAgencyLeads, mapAgencyLeadToOcd } from "./leads.js"
import { mapAgencyCampaignToOcd } from "./campaigns.js"

export async function pollLeads(
  config: SyncConfig,
  lastSyncAt: string | null,
): Promise<{ created: number; updated: number }> {
  const rows = await listAgencyLeads(config)
  let created = 0
  let updated = 0

  for (const row of rows) {
    const updatedAt = (row as any).updated_at || (row as any).updatedAt
    if (lastSyncAt && updatedAt && updatedAt <= lastSyncAt) continue

    // Check if lead exists in OCD by sync_id extracted from outboundMessage
    const syncId = (row as any).outboundMessage
    if (syncId) {
      const existing = db.prepare("SELECT id FROM leads WHERE sync_id = ?").get(syncId)
      if (existing) {
        updated++
      } else {
        created++
      }
    } else {
      // No sync_id yet, check by email
      const existing = db.prepare("SELECT id FROM leads WHERE email = ?").get(row.email || "")
      if (existing) {
        updated++
      } else {
        created++
      }
    }
  }

  return { created, updated }
}

export async function pollCampaigns(
  config: SyncConfig,
  lastSyncAt: string | null,
): Promise<{ created: number; updated: number }> {
  // agencyCampaigns polling — implement when object exists in Twenty
  return { created: 0, updated: 0 }
}

export function findOcdLeadBySyncId(syncId: string): { id: string } | null {
  const row = db.prepare("SELECT id FROM leads WHERE sync_id = ?").get(syncId) as { id: string } | undefined
  return row || null
}

export function findOcdLeadByEmail(email: string): { id: string } | null {
  if (!email) return null
  const row = db.prepare("SELECT id FROM leads WHERE email = ?").get(email) as { id: string } | undefined
  return row || null
}
