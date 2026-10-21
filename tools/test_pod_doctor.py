from pod_doctor import diagnose, controller_owned


def pod(phase="Running", cs=None, owner=True):
    return {"metadata": {"name": "p", "namespace": "n", "ownerReferences": [{"controller": owner}] if owner else []},
            "status": {"phase": phase, "containerStatuses": cs or []}}


def test_healthy():
    assert diagnose(pod(cs=[{"name": "a", "ready": True, "restartCount": 0, "state": {"running": {}}}])) == []


def test_crashloop_is_restartable():
    p = diagnose(pod(cs=[{"name": "a", "ready": False, "state": {"waiting": {"reason": "CrashLoopBackOff"}}}]))
    assert p[0]["reason"] == "CrashLoopBackOff" and p[0]["restartable"]


def test_image_pull_not_restartable():
    p = diagnose(pod("Pending", [{"name": "a", "state": {"waiting": {"reason": "ImagePullBackOff"}}}]))
    assert p[0]["reason"] == "ImagePullBackOff" and not p[0]["restartable"]


def test_oom_reported_not_restarted():
    p = diagnose(pod(cs=[{"name": "a", "ready": True, "state": {"running": {}},
                          "lastState": {"terminated": {"reason": "OOMKilled"}}}]))
    assert p[0]["reason"] == "OOMKilled" and not p[0]["restartable"]


def test_unowned_pod_never_restarted():
    assert not controller_owned(pod(owner=False))
