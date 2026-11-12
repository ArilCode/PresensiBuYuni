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
    });
  });

  // ---------- isi pilihan tanggal / bulan / tahun ----------
  var i, o;
  for (i = 1; i <= 31; i++) { o = el("option", "", String(i)); o.value = i; $("f-tanggal").appendChild(o); }
  BULAN.forEach(function (n, idx) { var op = el("option", "", n); op.value = idx + 1; $("f-bulan").appendChild(op); });
  var now = new Date().getFullYear();
  for (i = now; i >= 2024; i--) { o = el("option", "", String(i)); o.value = i; $("f-tahun").appendChild(o); }

  // ---------- Supabase ----------
  var configured = C.SUPABASE_URL && C.SUPABASE_KEY && C.SUPABASE_URL.indexOf("GANTI") === -1 && C.SUPABASE_KEY.indexOf("GANTI") === -1;
  var sb = null;
  if (configured && window.supabase) {
    sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  function showError(msg) { var e = $("f-error"); e.textContent = msg; e.hidden = !msg; }
  if (!sb) { showError("Web belum disambungkan ke database. Isi file config.js terlebih dahulu."); }

  // ---------- banner info dari developer ----------
  if (sb) {
    sb.rpc("get_info_aktif").then(function (r) {
      if (r.data && r.data.length && r.data[0].pesan) {
        var b = $("banner"); b.textContent = "📢 " + r.data[0].pesan; b.hidden = false;
      }
    });
  }

  // ---------- tampilkan data ----------
  function tampil(rows, t, b, y) {
    var tbody = $("tbody"); tbody.innerHTML = "";
    $("hasil-judul").textContent = "Presensi " + (t ? t + " " : "") + BULAN[b - 1] + " " + y;
    $("hasil-jumlah").textContent = rows.length + " data";
    $("kosong").hidden = rows.length > 0;
    $("tabel").hidden = rows.length === 0;
    rows.forEach(function (r, idx) {
      var p = r.tanggal.split("-");                       // "2026-11-12"
      var d = new Date(+p[0], +p[1] - 1, +p[2]);
      var tr = el("tr");
      function td(label, content) {
        var c = el("td"); c.dataset.label = label;
        if (typeof content === "string") c.textContent = content; else c.appendChild(content);
        tr.appendChild(c);
      }
      var st = String(r.status);
      td("No", String(idx + 1));
      td("Nama", r.nama);
      td("Hari", HARI[d.getDay()]);
      td("Tanggal", String(+p[2]));
      td("Bulan", BULAN[+p[1] - 1]);
      td("Tahun", p[0]);
      td("Status", el("span", "badge " + st.toLowerCase().replace(/[^a-z]/g, ""), st));
      tbody.appendChild(tr);
    });
    $("placeholder").hidden = true;
    $("hasil").hidden = false;
  }

  $("filter").addEventListener("submit", function (ev) {
    ev.preventDefault();
    showError("");
    if (!sb) { showError("Web belum disambungkan ke database. Isi file config.js terlebih dahulu."); return; }
    var t = $("f-tanggal").value, b = $("f-bulan").value, y = $("f-tahun").value;
    if (!b || !y) { showError("Pilih bulan dan tahun dulu ya."); return; }
    var btn = $("f-btn"); btn.disabled = true; btn.textContent = "Memuat…";
    sb.rpc("get_presensi", { p_tanggal: t ? +t : null, p_bulan: +b, p_tahun: +y }).then(function (r) {
      btn.disabled = false; btn.textContent = "Tampilkan";
      if (r.error) { showError("Gagal memuat data. Coba lagi sebentar lagi."); return; }
      tampil(r.data || [], t, +b, y);
    }).catch(function () {
      btn.disabled = false; btn.textContent = "Tampilkan";
      showError("Tidak bisa terhubung. Periksa koneksi internetmu.");
    });
  });
})();
