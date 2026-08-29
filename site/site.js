// Waitlist form on the homepage. Posts to /api/waitlist; falls back to a mailto when
// that endpoint does not exist yet.
(function () {
  var form = document.getElementById("waitlist");
  if (!form) return;
  var msg = document.getElementById("waitlist-msg");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = form.email.value.trim();
    msg.textContent = "Even geduld...";
    fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email })
    }).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      msg.textContent = "Top, je staat op de lijst.";
      form.email.value = "";
    }).catch(function () {
      msg.innerHTML = 'Aanmelden lukt nog niet automatisch. Mail even naar <a href="mailto:hallo@crowdcampers.com?subject=Houd%20me%20op%20de%20hoogte">hallo@crowdcampers.com</a>.';
    });
  });
})();
