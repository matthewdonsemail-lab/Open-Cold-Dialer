import type { SyncConfig } from "./config.js"
import db from "../db/database.js"
import { v4 as uuid } from "uuid"

const OBJECT_NAME = "agencyProspects"

export interface ProspectsResponse {
  data: {
    rows: Array<{
      id: string
      created_at: string
      updated_at?: string | null
      name?: string | null
      email?: string | null
      phone?: string | null
      company?: string | null
      status?: string | null
      notes?: string | null
      outboundMessage?: string | null
      dnc?: boolean | null
    }>
  }
}

export interface AgencyProspect {
  id: string
  name?: string | null
  email?: string | null
  phone?: string | null
  company?: string | null
  status?: string | null
  notes?: string | null
  outboundMessage?: string | null
  dnc?: boolean | null
}

export function mapAgencyProspectToOcd(prospect: AgencyProspect) {
  const syncIdMatch = prospect.outboundMessage?.match(/sync_id:([a-f0-9\-]+)/)
  
  // Try to split name into first and last
  const nameParts = (prospect.name || "").split(" ")
  const firstName = nameParts.length > 0 ? nameParts[0] : null
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null
  
  return {
    first_name: firstName,
    last_name: lastName,
    email: prospect.email,
    phone: prospect.phone,
    company: prospect.company,
    status: prospect.status || "new",
    notes: prospect.notes,
    dnc: prospect.dnc || false,
    sync_id: syncIdMatch ? syncIdMatch[1] : null,
  }
}

export function mapProspectToAgency(prospect: any): AgencyProspect & { sync_id: string } {
  return {
    id: prospect.id,
    name: `${prospect.first_name || ''} ${prospect.last_name || ''}`.trim(),
    email: prospect.email,
    phone: prospect.phone,
    company: prospect.company,
    status: prospect.status,
    notes: prospect.notes,
    dnc: prospect.dnc,
    sync_id: prospect.sync_id,
  }
}

export async function listAgencyProspects(config: SyncConfig): Promise<AgencyProspect[]> {
  const url = `${config.twentyBaseUrl}/${OBJECT_NAME}?limit=100`
  console.log("[sync] Querying Twenty:", url)
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.twentyApiKey}` },
  })
  const text = await response.text()
  console.log("[sync] Twenty response status:", response.status)
  console.log("[sync] Twenty response body:", text)
  
  if (!response.ok) throw new Error(`Failed to list ${OBJECT_NAME}: ${response.status} ${text}`)
  const json = JSON.parse(text)
  
  // Twenty paginated response: { data: { agencyProspects: [...] }, totalCount, pageInfo }
  const raw = json.data?.[OBJECT_NAME] || json.data?.rows || json.data || []
  const rows = Array.isArray(raw) ? raw : []
  console.log("[sync] agencyProspects count:", rows.length)
  return rows
}

export async function createAgencyProspect(config: SyncConfig, prospect: AgencyProspect & { sync_id: string }): Promise<void> {
  const payload = {
    name: prospect.name,
    email: prospect.email,
    phone: prospect.phone,
    company: prospect.company,
    status: prospect.status,
    notes: prospect.notes,
    dnc: prospect.dnc,
    outboundMessage: `sync_id:${prospect.sync_id}`,
  }
  const response = await fetch(`${config.twentyBaseUrl}/${OBJECT_NAME}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.twentyApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`Failed to create ${OBJECT_NAME}: ${response.status}`)
}

export async function updateAgencyProspect(config: SyncConfig, syncId: string, updates: Partial<AgencyProspect>): Promise<void> {
  const prospects = await listAgencyProspects(config)
  const target = prospects.find(p => p.outboundMessage?.includes(`sync_id:${syncId}`))
  if (!target) throw new Error(`Prospect not found in Twenty with sync_id: ${syncId}`)

  const payload: Record<string, any> = {}
  if (updates.name !== undefined) payload.name = updates.name
  if (updates.email !== undefined) payload.email = updates.email
  if (updates.phone !== undefined) payload.phone = updates.phone
  if (updates.company !== undefined) payload.company = updates.company
  if (updates.status !== undefined) payload.status = updates.status
  if (updates.notes !== undefined) payload.notes = updates.notes
  if (updates.dnc !== undefined) payload.dnc = updates.dnc

  const response = await fetch(`${config.twentyBaseUrl}/${OBJECT_NAME}/${target.id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${config.twentyApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`Failed to update ${OBJECT_NAME}: ${response.status}`)
}

export async function deleteAgencyProspect(config: SyncConfig, syncId: string): Promise<void> {
  const prospects = await listAgencyProspects(config)
  const target = prospects.find(p => p.outboundMessage?.includes(`sync_id:${syncId}`))
  if (!target) return

  const response = await fetch(`${config.twentyBaseUrl}/${OBJECT_NAME}/${target.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${config.twentyApiKey}` },
  })
  if (!response.ok && response.status !== 204) throw new Error(`Failed to delete ${OBJECT_NAME}: ${response.status}`)
}

export async function ensureAgencyProspectObject(config: SyncConfig): Promise<void> {
  // agencyProspects is a custom object that should already exist in Twenty
  // This function verifies it exists and logs a warning if not
  try {
    await listAgencyProspects(config)
    console.log("[sync] agencyProspects object is available")
  } catch (err) {
    console.warn("[sync] agencyProspects object not found in Twenty:", err)
  }
}

export function findOcdProspectBySyncId(syncId: string): { id: string } | null {
  const row = db.prepare("SELECT id FROM prospects WHERE sync_id = ?").get(syncId) as { id: string } | undefined
  return row || null
}

export function findOcdProspectByEmail(email: string): { id: string } | null {
  if (!email) return null
  const row = db.prepare("SELECT id FROM prospects WHERE email = ?").get(email) as { id: string } | undefined
  return row || null
}
