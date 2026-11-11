export const IMPORT_TARGETS = [
  { value: "email", label: "Email" },
  { value: "first_name", label: "First name" },
  { value: "last_name", label: "Last name" },
  { value: "full_name", label: "Full name (split)" },
  { value: "company", label: "Company" },
  { value: "designation", label: "Designation" },
  { value: "industry", label: "Industry" },
  { value: "custom", label: "Custom field" },
  { value: "ignore", label: "Don't import" },
] as const;
export type ImportTarget = (typeof IMPORT_TARGETS)[number]["value"];

const SYNONYMS: Record<Exclude<ImportTarget, "custom" | "ignore">, string[]> = {
  email: ["email", "emailaddress", "mail", "workemail", "businessemail", "e-mail"],
  first_name: ["firstname", "first", "fname", "givenname"],
  last_name: ["lastname", "last", "lname", "surname", "familyname"],
  full_name: ["name", "fullname", "contactname", "contact"],
  company: ["company", "companyname", "organization", "organisation", "account", "business", "firm"],
  designation: ["designation", "title", "jobtitle", "position", "role"],
  industry: ["industry", "sector", "vertical"],
};

export function guessTarget(header: string): ImportTarget {
  const h = header.toLowerCase().replace(/[^a-z-]/g, "");
  for (const [target, words] of Object.entries(SYNONYMS)) {
    if (words.includes(h)) return target as ImportTarget;
  }
  return "custom";
}

export function customKey(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "field";
}

export type MappedLead = {
  email: string;
  first_name: string;
  last_name: string;
  company: string;
  designation: string;
  industry: string;
  custom_fields: Record<string, string>;
  _row: number;
};

export function mapRow(row: Record<string, unknown>, mapping: Record<string, ImportTarget>, index: number): MappedLead {
  const out: MappedLead = {
    email: "",
    first_name: "",
    last_name: "",
    company: "",
    designation: "",
    industry: "",
    custom_fields: {},
    _row: index + 2,
  };
  for (const [header, target] of Object.entries(mapping)) {
    const raw = row[header];
    const v = raw == null ? "" : String(raw).trim();
    if (!v || target === "ignore") continue;
    if (target === "custom") out.custom_fields[customKey(header)] = v;
    else if (target === "full_name") {
      const [first, ...rest] = v.split(/\s+/);
      if (!out.first_name) out.first_name = first;
      if (!out.last_name) out.last_name = rest.join(" ");
    } else out[target] = v;
  }
  return out;
}
