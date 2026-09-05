import type { SyncConfig } from "./config.js"

type AgencyLeadStatus = "NEW" | "CONTACTED" | "QUALIFIED" | "BOOKED" | "CONVERTED" | "LOST"

const OCD_STATUS_MAP: Record<string, AgencyLeadStatus> = {
  new: "NEW",
  contacted: "CONTACTED",
  interested: "QUALIFIED",
  callback: "BOOKED",
  converted: "CONVERTED",
  not_interested: "LOST",
  do_not_contact: "LOST",
}

const STATUS_REVERSE_MAP: Record<AgencyLeadStatus, string> = {
  NEW: "new",
  CONTACTED: "contacted",
  QUALIFIED: "interested",
  BOOKED: "callback",
  CONVERTED: "converted",
  LOST: "not_interested",
}

interface AgencyLeadWrite {
  contactName?: string
  email?: string
  phone?: {
    primaryPhoneNumber: string
    primaryPhoneCountryCode: string
    primaryPhoneCallingCode: string
    additionalPhones: unknown[]
  }
  source?: string
  status?: AgencyLeadStatus
  note?: string
  outboundMessage?: string
  replyAt?: string
  agencyProspectId?: string
}

interface AgencyLeadRow extends AgencyLeadWrite {
  id: string
  name?: string
}

export async function ensureAgencyLeadObject(config: SyncConfig): Promise<void> {
  // This is a no-op since Twenty already has the agencyLeads object.
  // Future: could use the ui-kit ensureAgencyLeadObject if needed.
}

export async function listAgencyLeads(config: SyncConfig): Promise<AgencyLeadRow[]> {
  const res = await fetch(`${config.twentyBaseUrl}/agencyLeads?limit=200`, {
    headers: { Authorization: `Bearer ${config.twentyApiKey}` },
  })
  if (!res.ok) throw new Error(`Failed to list agencyLeads: ${res.status}`)
  const json = await res.json()
  const data = (json as { data?: Record<string, unknown> })?.data
  const rows = data?.agencyLeads
  if (Array.isArray(rows)) return rows as AgencyLeadRow[]
  if (rows && typeof rows === "object" && Array.isArray((rows as { edges?: unknown[] }).edges)) {
    return ((rows as { edges: { node?: AgencyLeadRow }[] }).edges).map(e => e.node!).filter(Boolean)
  }
  return []
}

export function mapOcdLeadToAgencyLead(lead: {
  id: string
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  company?: string
  status?: string
  source?: string
  notes?: string
  dnc?: boolean
  sync_id?: string
}): AgencyLeadWrite {
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() || undefined
  const status = lead.dnc ? "LOST" : (OCD_STATUS_MAP[lead.status || ""] ?? "NEW")
  const noteParts = [lead.company, lead.notes]
  if (lead.sync_id) noteParts.unshift(`sync_id:${lead.sync_id}`)
  return {
    contactName: fullName,
    email: lead.email,
    phone: lead.phone
      ? {
          primaryPhoneNumber: lead.phone.replace(/\D/g, ""),
          primaryPhoneCountryCode: "",
          primaryPhoneCallingCode: "",
          additionalPhones: [],
        }
      : undefined,
    source: lead.source,
    status,
    note: noteParts.length > 0 ? noteParts.join("\n") : undefined,
    outboundMessage: lead.sync_id, // Store sync_id here for lookup
  }
}

export function mapAgencyLeadToOcd(lead: AgencyLeadRow): {
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  status?: string
  source?: string
  notes?: string
  dnc?: boolean
} {
  const name = lead.contactName || lead.name || ""
  const parts = name.split(" ")
  return {
    first_name: parts[0] || undefined,
    last_name: parts.slice(1).join(" ") || undefined,
    email: lead.email,
    phone: lead.phone?.primaryPhoneNumber,
    status: lead.status ? STATUS_REVERSE_MAP[lead.status] : "new",
    source: lead.source,
    notes: lead.note,
    dnc: lead.status === "LOST",
  }
}

export async function createAgencyLead(
  config: SyncConfig,
  payload: AgencyLeadWrite & { sync_id?: string },
): Promise<{ id: string; action: "created" | "updated" }> {
  const res = await fetch(`${config.twentyBaseUrl}/agencyLeads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.twentyApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Failed to create agencyLead: ${res.status}`)
  const json = await res.json()
  const id = (json as { data?: { id?: string } })?.data?.id
  return { id: id || "", action: "created" }
}

export async function updateAgencyLead(
  config: SyncConfig,
  id: string,
  payload: AgencyLeadWrite,
): Promise<void> {
  const res = await fetch(`${config.twentyBaseUrl}/agencyLeads/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${config.twentyApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to update agencyLead: ${res.status}`)
  }
}

export async function deleteAgencyLead(
  config: SyncConfig,
  id: string,
): Promise<void> {
  const res = await fetch(`${config.twentyBaseUrl}/agencyLeads/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${config.twentyApiKey}` },
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete agencyLead: ${res.status}`)
  }
}

export async function findByEmail(
  config: SyncConfig,
  email: string,
): Promise<AgencyLeadRow | null> {
  const res = await fetch(
    `${config.twentyBaseUrl}/agencyLeads?limit=1&filter=emails.primaryEmail[eq]:${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${config.twentyApiKey}` } },
  )
  if (!res.ok) return null
  const json = await res.json()
  const data = (json as { data?: Record<string, unknown> })?.data
  const rows = data?.agencyLeads
  if (Array.isArray(rows) && rows.length > 0) {
    return rows[0] as AgencyLeadRow
  }
  return null
}
