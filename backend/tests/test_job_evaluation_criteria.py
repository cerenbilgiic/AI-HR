from app.services import job_service


def _patch_session_local(mocker, db_session):
    # generate_evaluation_criteria opens its own SessionLocal() (it's a
    # background task — see the function's docstring) — point that at this
    # test's isolated, rolled-back session instead of a real connection, or
    # its commit() would write straight to the persistent dev DB regardless
    # of this test's transaction (same pattern as
    # test_candidate_cv_upload.py's test_extract_and_merge_cv_skills_...).
    mocker.patch("app.services.job_service.SessionLocal", return_value=db_session)
    mocker.patch.object(db_session, "close", lambda: None)


def test_generate_evaluation_criteria_saves_formatted_text(db_session, job, mocker):
    _patch_session_local(mocker, db_session)
    provider = mocker.MagicMock()
    provider.generate_evaluation_criteria.return_value = ["Kasada hızlı ve doğru işlem yapabilme", "Stresli anlarda sakin kalma"]
    mocker.patch("app.services.job_service.get_ai_provider", return_value=provider)

    job_service.generate_evaluation_criteria(job.id)

    db_session.refresh(job)
    assert "- Kasada hızlı ve doğru işlem yapabilme" in job.evaluation_criteria
    assert "- Stresli anlarda sakin kalma" in job.evaluation_criteria
    provider.generate_evaluation_criteria.assert_called_once()
    assert provider.generate_evaluation_criteria.call_args.args[0] == job.title


def test_generate_evaluation_criteria_is_best_effort_on_ai_failure(db_session, job, mocker):
    _patch_session_local(mocker, db_session)
    provider = mocker.MagicMock()
    provider.generate_evaluation_criteria.side_effect = RuntimeError("model unavailable")
    mocker.patch("app.services.job_service.get_ai_provider", return_value=provider)

    job_service.generate_evaluation_criteria(job.id)  # must not raise

    db_session.refresh(job)
    assert job.evaluation_criteria is None


def test_generate_evaluation_criteria_noop_for_missing_job(db_session, mocker):
    _patch_session_local(mocker, db_session)
    provider = mocker.MagicMock()
    mocker.patch("app.services.job_service.get_ai_provider", return_value=provider)

    job_service.generate_evaluation_criteria(999999)  # must not raise

    provider.generate_evaluation_criteria.assert_not_called()


def test_create_job_schedules_evaluation_criteria_background_task(client, as_hr, mocker):
    mock_generate = mocker.patch("app.services.job_service.generate_evaluation_criteria")

    response = client.post(
        "/api/v1/jobs",
        json={"title": "Depo Sorumlusu", "description": "Depo operasyonlarını yönetir."},
    )

    assert response.status_code == 201
    new_job_id = response.json()["id"]
    mock_generate.assert_called_once_with(new_job_id)
