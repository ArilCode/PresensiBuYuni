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
  var state = { all: [], view: [], tanggal: "", reqId: 0 };

  // ---------- render tabel ----------
  function render() {
    var kelas = $("f-kelas").value, nama = $("f-nama").value.trim().toLowerCase();
    state.view = state.all.filter(function (r) {
      return (!kelas || r.kelas === kelas) && (!nama || String(r.nama).toLowerCase().indexOf(nama) !== -1);
    });
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
    state.tanggal = tanggal;
    $("memuat").hidden = false; $("kosong").hidden = true; $("tabel").hidden = true;
    $("hasil-judul").textContent = "Presensi " + tglPanjang(tanggal);
    $("hasil-jumlah").textContent = "";
    $("catatan").hidden = true;
    sb.rpc("get_catatan_hari", { p_tanggal: tanggal }).then(function (c) {
      if (id !== state.reqId) return;
      var t = c && typeof c.data === "string" ? c.data.trim() : "";
      $("catatan-isi").textContent = t; $("catatan").hidden = !t;
    });
    sb.rpc("get_presensi_hari", { p_tanggal: tanggal }).then(function (r) {
      if (id !== state.reqId) return;                         // abaikan jawaban lama
      $("memuat").hidden = true;
      if (r.error) { state.all = []; render(); $("kosong").hidden = true; showError("Gagal memuat data. Coba lagi sebentar lagi."); return; }
      state.all = r.data || [];
      render();
    }).catch(function () {
      if (id !== state.reqId) return;
      $("memuat").hidden = true; state.all = []; render(); $("kosong").hidden = true;
      showError("Tidak bisa terhubung. Periksa koneksi internetmu.");
    });
  }

  // ---------- pilihan kelas ----------
  if (sb) {
    sb.rpc("get_kelas").then(function (r) {
      (r.data || []).forEach(function (k) { var o = el("option", "", k.kelas); o.value = k.kelas; $("f-kelas").appendChild(o); });
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
    $("f-tanggal").value = todayWIB(); $("f-kelas").value = ""; $("f-nama").value = "";
    muat($("f-tanggal").value);
  });

  // ---------- unduh Excel (ExcelJS dimuat saat dibutuhkan saja) ----------
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

  $("f-xlsx").addEventListener("click", function () {
    showError("");
    var rows = state.view.slice();
    if (!rows.length) { showError("Tidak ada data untuk diunduh."); return; }
    var btn = $("f-xlsx"); btn.disabled = true; btn.textContent = "Menyiapkan…";
    loadExcelJS().then(function () {
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
      a.download = "Presensi_" + state.tanggal + kelas + ".xlsx";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }).catch(function () {
      showError("Gagal membuat file Excel. Periksa internet lalu coba lagi.");
    }).then(function () { btn.disabled = false; btn.textContent = "⬇ Excel"; });
  });

  // ---------- MULAI: langsung tampilkan hari ini ----------
  $("f-tanggal").value = todayWIB();
  muat($("f-tanggal").value);
})();
