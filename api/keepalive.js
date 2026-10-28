// Раз в день Vercel вызывает этот адрес (см. vercel.json), чтобы бесплатный
// проект Supabase не засыпал после недели без активности.
module.exports = async function handler(req, res) {
  const url = "https://uskqeryhyyhcoghsximq.supabase.co/rest/v1/site_texts?select=key&limit=1";
  const key = "sb_publishable_d_MPDveGQK_YKL-B8epTqw_tyX8zBb5";
  try {
    const r = await fetch(url, { headers: { apikey: key } });
    res.status(200).json({ ok: r.ok, status: r.status, at: new Date().toISOString() });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e && e.message || e), at: new Date().toISOString() });
  }
};
