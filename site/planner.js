// Trip planner UI. Talks to the Worker at /api/plan and degrades to a friendly
// message when the Worker is missing, disabled, rate-limited or slow.
(function () {
  var form = document.getElementById("planner");
  var trip = document.getElementById("trip");
  var count = document.getElementById("count");
  var submit = document.getElementById("submit");
  var status = document.getElementById("status");
  var result = document.getElementById("result");

  var prefill = new URLSearchParams(location.search).get("trip");
  if (prefill) trip.value = prefill.slice(0, 600);
  count.textContent = trip.value.length;
  trip.addEventListener("input", function () { count.textContent = trip.value.length; });

  var MESSAGES = {
    403: "De anti-botcheck lukte niet. Ververs de pagina en probeer het opnieuw.",
    429: "Je hebt je plannen voor nu even op. Probeer het over een uurtje weer.",
    503: "De planner staat tijdelijk uit. Probeer het later nog eens.",
    offline: "De planner is nog niet online. We werken eraan; laat je e-mail achter op de homepage en je hoort het als eerste."
  };

  function show(html, cls) {
    status.innerHTML = '<div class="' + cls + '">' + html + "</div>";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function turnstileToken() {
    var el = form.querySelector('[name="cf-turnstile-response"]');
    return el ? el.value : "";
  }

  function render(plan) {
    document.getElementById("summary").textContent = plan.samenvatting || "Je route";
    var a = plan.aannames || [];
    document.getElementById("assumptions").innerHTML = a.length
      ? '<p class="hint">Aannames: ' + a.map(esc).join(" · ") + "</p>" : "";
    document.getElementById("days").innerHTML = (plan.dagen || []).map(function (d) {
      var p = d.plek || {};
      var alt = d.alternatief && d.alternatief.naam ? '<div class="alt">Alternatief: ' + esc(d.alternatief.naam) + "</div>" : "";
      return "<li>" +
        '<div class="day">Dag ' + esc(d.dag) + ": " + esc(d.etappe) + "</div>" +
        '<div class="km">' + esc(d.afstand_km) + " km</div>" +
        '<div class="spot"><strong>' + esc(p.naam) + "</strong> " +
        (p.osm_url ? '<a href="' + esc(p.osm_url) + '" rel="noopener" target="_blank">OSM</a>' : "") +
        "<br>" + esc(p.toelichting) + "</div>" + alt + "</li>";
    }).join("");
    var tips = plan.tips || [];
    document.getElementById("tips").innerHTML = tips.length
      ? "<h3>Tips</h3><ul>" + tips.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" : "";
    result.hidden = false;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = trip.value.trim();
    if (text.length < 10) { show("Vertel iets meer over je trip, dan kunnen we er wat mee.", "notice"); return; }
    submit.disabled = true;
    result.hidden = true;
    show("Route aan het uitzoeken, dit duurt zo'n 20 seconden.", "notice");

    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 60000);
    fetch(window.PLANNER_API || "/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip: text, turnstile: turnstileToken() }),
      signal: ctrl.signal
    }).then(function (r) {
      if (r.status === 404 || r.status === 405) throw new Error("offline");
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (b) {
        throw new Error(b.message || MESSAGES[r.status] || "Er ging iets mis (" + r.status + "). Probeer het zo nog eens.");
      });
      return r.json();
    }).then(function (plan) {
      status.innerHTML = "";
      render(plan);
    }).catch(function (err) {
      var msg = err.name === "AbortError" ? "Dit duurt te lang. Probeer het zo nog eens."
        : err.message === "offline" || err.message === "Failed to fetch" ? MESSAGES.offline : err.message;
      show(esc(msg), "error");
    }).finally(function () {
      clearTimeout(timer);
      submit.disabled = false;
      if (window.turnstile) try { window.turnstile.reset(); } catch (_) {}
    });
  });
})();
