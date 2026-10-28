// Какая база используется: боевая на основном адресе, тестовая везде ещё
// (превью Vercel, локальный просмотр). Ключи публичные — так задумано Supabase.
window.SITE_CONFIG = (function () {
  var PROD = {
    env: "prod",
    url: "https://uskqeryhyyhcoghsximq.supabase.co",
    key: "sb_publishable_d_MPDveGQK_YKL-B8epTqw_tyX8zBb5"
  };
  var DEV = {
    env: "dev",
    url: "https://czswdbkpqvnikacmhmxd.supabase.co",
    key: "sb_publishable_i9Q8SA7O2gNinkFWWESOZg_79TAtuAW"
  };
  var PROD_HOSTS = ["alishka-eight.vercel.app", "alishka-vvg0418.vercel.app", "alishka-git-main-vvg0418.vercel.app"];
  return PROD_HOSTS.indexOf(location.hostname) !== -1 ? PROD : DEV;
})();
