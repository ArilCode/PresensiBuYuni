(function () {
  "use strict";
  var C = window.APP_CONFIG || {};
  var HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  var BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  var $ = function (id) { return document.getElementById(id); };

  // ---------- helper aman: semua teks lewat textContent (anti XSS) ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function safeUrl(u) { return /^(https:\/\/|mailto:)/i.test(u) ? u : "#"; }
  function linkBtn(label, url) {
    var a = el("a", "", label);
    a.href = safeUrl(url);
    if (a.href.indexOf("mailto:") !== 0) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    return a;
  }

  // tombol ✕ pada banner info
  document.addEventListener("click", function (e) {
    var x = e.target.closest && e.target.closest(".info-x");
    if (x) x.closest(".infobar").hidden = true;
  });

  // ---------- tampilan umum ----------
  $("tahun").textContent = new Date().getFullYear();           // copyright otomatis
  $("foot-dev").textContent = C.DEV_NAME || "ACE";
  $("t-dev").textContent = C.DEV_NAME || "ACE";
  $("t-guru").textContent = C.GURU || "";
  (C.LINKS || []).forEach(function (l) { $("t-links").appendChild(linkBtn(l.label, l.url)); });
  if (C.EMAIL) {
    $("t-links").appendChild(linkBtn("Email", "mailto:" + C.EMAIL));
    $("t-report").appendChild(linkBtn("Kirim email laporan", "mailto:" + C.EMAIL + "?subject=" + encodeURIComponent("Laporan masalah Presensi Bu Yuni")));
  }
  (C.LINKS || []).slice(0, 1).forEach(function (l) { $("t-report").appendChild(linkBtn("Lapor via " + l.label, l.url)); });

  document.querySelectorAll(".nav-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".nav-btn").forEach(function (x) { x.classList.toggle("active", x === b); });
      document.querySelectorAll(".view").forEach(function (v) { v.hidden = v.id !== "view-" + b.dataset.view; });
      window.scrollTo(0, 0);
      if (b.scrollIntoView) b.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    });
  });

  // ---------- Supabase ----------
  var configured = C.SUPABASE_URL && C.SUPABASE_KEY && C.SUPABASE_URL.indexOf("GANTI") === -1 && C.SUPABASE_KEY.indexOf("GANTI") === -1;
  var sb = null;
  if (configured && window.supabase) {
    sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  function showError(msg) { var e = $("f-error"); e.textContent = msg; e.hidden = !msg; }

  // ---------- banner info dari developer ----------
  if (sb) {
    sb.rpc("get_info_aktif").then(function (r) {
      if (r.data && r.data.length && r.data[0].pesan) {
        var b = $("banner"); b.querySelector(".info-text").textContent = r.data[0].pesan; b.hidden = false;
      }
    });
  }

  // ---------- helper tanggal & teks ----------
  function todayWIB() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()); }
  function tglPanjang(s) {                                   // "2026-11-12" -> "Kamis, 12 November 2026"
    var p = s.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]);
    return HARI[d.getDay()] + ", " + (+p[2]) + " " + BULAN[+p[1] - 1] + " " + p[0];
  }
  // Keterangan ditulis manual di web 1 (hanya untuk status Izin); status lain tampil "-"
  function ket(r) { return String(r.status) === "Izin" && r.keterangan ? String(r.keterangan) : "-"; }

  // ---------- state ----------
  var state = { all: [], view: [], tanggal: "", reqId: 0, loading: false };
  var pendingKelas = null;

  // ---------- render tabel ----------
  function passFilter(r) {
    var kelas = $("f-kelas").value, nama = $("f-nama").value.trim().toLowerCase();
    return (!kelas || r.kelas === kelas) && (!nama || String(r.nama).toLowerCase().indexOf(nama) !== -1);
  }
  // alamat web selalu mengikuti filter -> bisa disalin langsung dari address bar
  function filterQuery() {
    var q = new URLSearchParams();
    q.set("tanggal", $("f-tanggal").value || state.tanggal);
    if ($("f-kelas").value) q.set("kelas", $("f-kelas").value);
    var n = $("f-nama").value.trim(); if (n) q.set("nama", n.slice(0, 60));
    return q.toString();
  }
  function syncUrl() {
    try { history.replaceState(null, "", location.pathname + "?" + filterQuery()); } catch (e) { /* abaikan */ }
  }
  function render() {
    if (state.loading) return;
    state.view = state.all.filter(passFilter);
    syncUrl();
    var tbody = $("tbody"); tbody.innerHTML = "";
    $("hasil-judul").textContent = "Presensi " + tglPanjang(state.tanggal);
    $("hasil-jumlah").textContent = state.view.length + " data";
    $("kosong").hidden = state.view.length > 0;
    $("tabel").hidden = state.view.length === 0;
    state.view.forEach(function (r, idx) {
      var tr = el("tr");
      var st = String(r.status);
      tr.appendChild(el("td", "", String(idx + 1)));
      tr.appendChild(el("td", "", r.nama));
      tr.appendChild(el("td", "", r.kelas));
      var tds = el("td"); tds.appendChild(el("span", "badge " + st.toLowerCase().replace(/[^a-z]/g, ""), st)); tr.appendChild(tds);
      tr.appendChild(el("td", "", tglPanjang(r.tanggal)));
      tr.appendChild(el("td", "ket", ket(r)));
      tbody.appendChild(tr);
    });
  }

  // ---------- ambil data satu tanggal ----------
  function muat(tanggal) {
    showError("");
    if (!sb) { showError("Web belum disambungkan ke database. Isi file config.js terlebih dahulu."); $("memuat").hidden = true; return; }
    var id = ++state.reqId;
    state.tanggal = tanggal; state.loading = true;
    $("memuat").hidden = false; $("kosong").hidden = true; $("tabel").hidden = true;
    $("hasil-judul").textContent = "Presensi " + tglPanjang(tanggal);
    $("hasil-jumlah").textContent = "";
    $("catatan").hidden = true; $("libur-info").hidden = true;
    sb.rpc("alasan_libur", { p_tanggal: tanggal }).then(function (c) {
      if (id !== state.reqId) return;
      var t = c && typeof c.data === "string" ? c.data.trim() : "";
      $("libur-isi").textContent = t; $("libur-info").hidden = !t;
    });
    sb.rpc("get_catatan_hari", { p_tanggal: tanggal }).then(function (c) {
      if (id !== state.reqId) return;
      var t = c && typeof c.data === "string" ? c.data.trim() : "";
      $("catatan-isi").textContent = t; $("catatan").hidden = !t;
    });
    sb.rpc("get_presensi_hari", { p_tanggal: tanggal }).then(function (r) {
      if (id !== state.reqId) return;                         // abaikan jawaban lama
      state.loading = false;
      $("memuat").hidden = true;
      if (r.error) { state.all = []; render(); $("kosong").hidden = true; showError("Gagal memuat data. Coba lagi sebentar lagi."); return; }
      state.all = r.data || [];
      render();
    }).catch(function () {
      if (id !== state.reqId) return;
      state.loading = false;
      $("memuat").hidden = true; state.all = []; render(); $("kosong").hidden = true;
      showError("Tidak bisa terhubung. Periksa koneksi internetmu.");
    });
  }

  // ---------- pilihan kelas ----------
  if (sb) {
    sb.rpc("get_kelas").then(function (r) {
      (r.data || []).forEach(function (k) { var o = el("option", "", k.kelas); o.value = k.kelas; $("f-kelas").appendChild(o); });
      if (pendingKelas) {
        var ok = Array.prototype.some.call($("f-kelas").options, function (o) { return o.value === pendingKelas; });
        if (ok) $("f-kelas").value = pendingKelas;
        pendingKelas = null; render();
      }
    });
  }

  // ---------- filter ----------
  $("filter").addEventListener("submit", function (e) { e.preventDefault(); });
  $("f-tanggal").addEventListener("change", function () {
    var v = $("f-tanggal").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { v = todayWIB(); $("f-tanggal").value = v; }
    muat(v);
  });
  $("f-kelas").addEventListener("change", render);
  $("f-nama").addEventListener("input", render);
  $("f-reset").addEventListener("click", function () {
    $("f-tanggal").value = todayWIB(); $("f-kelas").value = ""; $("f-nama").value = ""; $("shared-note").hidden = true;
    muat($("f-tanggal").value);
  });

  // ---------- toast ----------
  var toastTimer;
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2800);
  }

  // ---------- Excel (ExcelJS dimuat saat dibutuhkan saja) ----------
  function loadExcelJS() {
    return new Promise(function (resolve, reject) {
      if (window.ExcelJS) return resolve();
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
      s.onload = resolve; s.onerror = function () { reject(new Error("load")); };
      document.head.appendChild(s);
    });
  }
  var WARNA = { Hadir: "FF047857", Sakit: "FFB45309", Izin: "FF1D4ED8", Alfa: "FFB91C1C" };

  function buatXlsx(rows, base) {
    return loadExcelJS().then(function () {
      var wb = new window.ExcelJS.Workbook();
      var ws = wb.addWorksheet("Presensi", { views: [{ state: "frozen", ySplit: 1 }] });
      var head = ["NO", "NAMA", "KELAS", "STATUS", "TANGGAL", "KETERANGAN"];
      var data = rows.map(function (r, i) { return [i + 1, String(r.nama), String(r.kelas), String(r.status), tglPanjang(r.tanggal), ket(r)]; });
      ws.addRow(head);
      data.forEach(function (d) { ws.addRow(d); });

      // lebar kolom mengikuti teks terpanjang
      head.forEach(function (h, c) {
        var max = h.length;
        data.forEach(function (d) { max = Math.max(max, String(d[c]).length); });
        ws.getColumn(c + 1).width = Math.min(max + 4, 60);
      });

      var thin = { style: "thin", color: { argb: "FFB8C7C0" } };
      var border = { top: thin, left: thin, bottom: thin, right: thin };
      ws.eachRow(function (row, n) {
        row.eachCell(function (cell, col) {
          cell.border = border;
          cell.alignment = { vertical: "middle", horizontal: (col === 1 || n === 1) ? "center" : "left", wrapText: col === 6 };
          if (n === 1) {                                       // baris judul kolom berwarna
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF047857" } };
            cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
          } else if (col === 4) {
            cell.font = { bold: true, color: { argb: WARNA[cell.value] || "FF000000" } };
          }
        });
      });
      ws.getRow(1).height = 24;
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 6 } };
      return wb.xlsx.writeBuffer();
    }).then(function (buf) {
      var kelas = $("f-kelas").value ? "_" + $("f-kelas").value.replace(/[^A-Za-z0-9]+/g, "-") : "";
      var blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = base + kelas + ".xlsx";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });
  }

  // ambil data satu rentang tanggal (per halaman 1000 baris)
  function fetchRange(dari, sampai) {
    var all = [], page = 0, size = 1000;
    function next() {
      return sb.rpc("get_presensi_rentang", { p_dari: dari, p_sampai: sampai }).range(page * size, page * size + size - 1).then(function (r) {
        if (r.error) throw r.error;
        var d = r.data || []; all = all.concat(d);
        if (d.length < size || all.length >= 20000) return all;
        page++; return next();
      });
    }
    return next();
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function scopeInfo(scope) {
    var p = state.tanggal.split("-"), y = +p[0], m = +p[1];
    if (scope === "bulan") return { dari: y + "-" + pad(m) + "-01", sampai: y + "-" + pad(m) + "-" + pad(new Date(y, m, 0).getDate()), base: "Presensi_" + y + "-" + pad(m) };
    if (scope === "tahun") return { dari: y + "-01-01", sampai: y + "-12-31", base: "Presensi_" + y };
    return { base: "Presensi_" + state.tanggal };
  }
  function filterText() {
    var t = [], k = $("f-kelas").value, n = $("f-nama").value.trim();
    if (k) t.push("Kelas " + k); if (n) t.push('Nama "' + n + '"');
    return t.length ? "Filter: " + t.join(" • ") : "Semua kelas & semua nama";
  }

  var dlgU = $("unduhDlg");
  $("f-xlsx").addEventListener("click", function () {
    showError("");
    if (!sb) { showError("Web belum disambungkan ke database."); return; }
    var p = state.tanggal.split("-");
    $("u-hari").textContent = "📅 Per tanggal — " + tglPanjang(state.tanggal);
    $("u-bulan").textContent = "🗓 Per bulan — " + BULAN[+p[1] - 1] + " " + p[0];
    $("u-tahun").textContent = "📆 Per tahun — " + p[0];
    $("u-filter").textContent = filterText();
    $("u-status").textContent = "";
    dlgU.showModal();
  });
  $("u-tutup").addEventListener("click", function () { dlgU.close(); });
  document.querySelectorAll("#unduhDlg .opt").forEach(function (b) {
    b.addEventListener("click", function () {
      var scope = b.dataset.scope, info = scopeInfo(scope);
      var btns = document.querySelectorAll("#unduhDlg .opt");
      btns.forEach(function (x) { x.disabled = true; });
      $("u-status").textContent = "Menyiapkan file…";
      var job = scope === "hari" ? Promise.resolve(state.view.slice()) : fetchRange(info.dari, info.sampai).then(function (rows) { return rows.filter(passFilter); });
      job.then(function (rows) {
        if (!rows.length) { $("u-status").textContent = "Tidak ada data pada periode & filter ini."; return; }
        return buatXlsx(rows, info.base).then(function () { $("u-status").textContent = ""; dlgU.close(); toast("File Excel diunduh (" + rows.length + " baris)"); });
      }).catch(function () {
        $("u-status").textContent = "Gagal membuat file. Periksa internet lalu coba lagi.";
      }).then(function () { btns.forEach(function (x) { x.disabled = false; }); });
    });
  });

  // ---------- bagikan hasil filter ----------
  function shareUrl() { return location.origin + location.pathname + "?" + filterQuery(); }
  function shareText() {
    var rows = state.view, cnt = {};
    rows.forEach(function (r) { cnt[r.status] = (cnt[r.status] || 0) + 1; });
    var ring = ["Hadir", "Sakit", "Izin", "Alfa"].filter(function (s) { return cnt[s]; }).map(function (s) { return s + " " + cnt[s]; }).join(", ");
    return "Presensi " + tglPanjang($("f-tanggal").value || state.tanggal) + "\n" + filterText() + "\n" +
      (rows.length ? rows.length + " data (" + ring + ")" : "Tidak ada data");
  }
  function salin(teks) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(teks);
    return new Promise(function (resolve, reject) {
      var t = document.createElement("textarea"); t.value = teks; t.setAttribute("readonly", "");
      t.style.position = "fixed"; t.style.opacity = "0"; document.body.appendChild(t); t.select();
      try { document.execCommand("copy") ? resolve() : reject(new Error("copy")); } catch (e) { reject(e); }
      t.remove();
    });
  }
  $("f-share").addEventListener("click", function () {
    var url = shareUrl(), teks = shareText();
    if (navigator.share) {
      navigator.share({ title: "Presensi Bu Yuni", text: teks, url: url }).catch(function (e) {
        if (e && e.name === "AbortError") return;           // dibatalkan pengguna
        salin(teks + "\n" + url).then(function () { toast("Link disalin ✓"); }).catch(function () { window.prompt("Salin link ini:", url); });
      });
      return;
    }
    salin(teks + "\n" + url).then(function () { toast("Link disalin ✓ — tinggal tempel di chat"); })
      .catch(function () { window.prompt("Salin link ini:", url); });
  });

  // ---------- MULAI: baca filter dari link (jika dibagikan), jika tidak tampilkan hari ini ----------
  (function init() {
    var qs = new URLSearchParams(location.search), shared = false;
    var qt = qs.get("tanggal"), start = todayWIB();
    if (qt && /^\d{4}-\d{2}-\d{2}$/.test(qt)) {
      var d = new Date(+qt.slice(0, 4), +qt.slice(5, 7) - 1, +qt.slice(8, 10));
      var okd = d.getFullYear() >= 2020 && d.getFullYear() <= 2100 && pad(d.getMonth() + 1) === qt.slice(5, 7) && pad(d.getDate()) === qt.slice(8, 10);
      if (okd) { start = qt; shared = true; }
    }
    var qk = (qs.get("kelas") || "").slice(0, 30), qn = (qs.get("nama") || "").slice(0, 60);
    if (qk) { pendingKelas = qk; shared = true; }
    if (qn) { $("f-nama").value = qn; shared = true; }
    $("shared-note").hidden = !shared;
    $("f-tanggal").value = start;
    muat(start);
  })();
})();
