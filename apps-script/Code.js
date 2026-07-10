// ─── Router ───────────────────────────────────────────────────────────────────
// Deploy settings: Execute as "Me (owner)", Access "Anyone"
// Identity is verified via Google ID token (GIS) — not Session.getActiveUser()

function doGet(e) {
  try {
    const user = verifyToken(e.parameter.idToken);
    const action = e.parameter.action;

    switch (action) {
      case 'getProgram':    return jsonResponse(getProgram(e.parameter.pid));
      case 'getMyProfile':  return jsonResponse(getMyProfile(user.email));
      case 'getKPI':        return jsonResponse(getKPI(user.email));
      default:              return jsonError('Action tidak dikenali: ' + action);
    }

  } catch (err) {
    console.error(err);
    return jsonError(err.message);
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const user = verifyToken(payload.idToken);
    const action = payload.action;

    switch (action) {
      case 'getProgram':    return jsonResponse(getProgram(payload.pid));
      case 'getMyProfile':  return jsonResponse(getMyProfile(user.email));
      case 'getKPI':        return jsonResponse(getKPI(user.email));

      case 'submitParticipation':
        // Name comes from the verified token, NOT the client payload
        return jsonResponse(submitParticipation(payload.pid, payload.profile, user.email, user.name));

      case 'createProgram':
        return jsonResponse(createProgram(payload, user.email));

      case 'closeProgram':
        return jsonResponse(closeProgram(payload.pid, user.email));

      default:
        return jsonError('Action tidak dikenali: ' + action);
    }

  } catch (err) {
    console.error(err);
    return jsonError(err.message);
  }
}
