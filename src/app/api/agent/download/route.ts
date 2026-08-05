import { NextResponse } from "next/server";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { buildZip, type ZipFile } from "@/lib/zip";

export const dynamic = "force-dynamic";

// Folder Scanner Agent di root repo (ikut ter-deploy ke Vercel).
const AGENT_DIR = path.join(process.cwd(), "scanner-agent");

// File yang dikemas — whitelist tetap (install.sh/install.ps1 dikeluarkan:
// itu untuk jalur curl one-liner; ZIP ini lengkap untuk jalur manual).
const ALLOWED = new Set([
  "agent.py",
  "requirements.txt",
  "agent.env.example",
  "start-agent.bat",
  "start-agent.sh",
  "install-autostart-windows.bat",
  "install-autostart-linux.sh",
  "README.md",
]);

/**
 * GET /api/agent/download
 * Unduh Scanner Agent versi terpasang sebagai ZIP (vscan-agent.zip).
 * Isi ZIP sama persis dengan folder scanner-agent/ di repo, jadi selalu
 * sinkron dengan versi aplikasi yang sedang berjalan.
 */
export async function GET() {
  let entries: string[];
  try {
    entries = await readdir(AGENT_DIR);
  } catch {
    return NextResponse.json(
      { error: "Folder scanner-agent tidak ditemukan" },
      { status: 404 }
    );
  }

  const files: ZipFile[] = [];
  for (const name of entries) {
    if (!ALLOWED.has(name)) continue;
    try {
      const buf = await readFile(path.join(AGENT_DIR, name));
      files.push({ name, data: new Uint8Array(buf) });
    } catch {
      // file tidak terbaca — lewati
    }
  }

  if (files.length === 0) {
    return NextResponse.json(
      { error: "Tidak ada file agent yang bisa diunduh" },
      { status: 404 }
    );
  }

  const zip = buildZip(files);
  return new Response(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="vscan-agent.zip"',
      "Content-Length": String(zip.length),
      "Cache-Control": "no-store",
    },
  });
}
