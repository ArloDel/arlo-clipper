<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Git Commit Rules (Granular / Atomic Commits)

Setiap kali melakukan perubahan kode, perbaikan bug, refactoring, atau penambahan fitur, WAJIB memecah commit menjadi jumlah commit maksimal yang paling granular dan logis (JANGAN digabung dalam 1 commit besar/monolitik):

1. **Satu Perubahan Logis per Commit**: Pisahkan commit berdasarkan lapisan atau tanggung jawab:
   - Perubahan token desain / variabel CSS global (`style(...)`)
   - Perubahan styling per komponen / modul CSS (`style(...)`)
   - Helper, utilitas, atau katalog data baru (`feat(...)` / `chore(...)`)
   - Perubahan endpoint API / backend (`feat(...)` / `fix(...)`)
   - Restrukturisasi layout / komponen UI (`refactor(...)`)
   - Penambahan fitur interaktif / state per bagian (`feat(...)`)
   - Perbaikan bug atau penghapusan kode mati (`fix(...)` / `chore(...)`)
2. **Format Conventional Commits**: Gunakan prefix standar (`feat`, `fix`, `refactor`, `style`, `chore`, `docs`, `test`) diikuti scope, contoh: `feat(editorial): ...`, `style(editorial): ...`.
3. **Pastikan Setiap Commit Valid**: Setiap pecahan commit harus dalam kondisi tidak merusak syntax/build sebelum lanjut ke commit berikutnya.

