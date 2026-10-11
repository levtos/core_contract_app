from core_contracts.app import main, prepare_setup


def test_invalid_options_never_log_configuration(tmp_path, monkeypatch, caplog, capsys):
    monkeypatch.setenv("CORE_CONTRACTS_DATA", str(tmp_path))
    (tmp_path / "options.json").write_text('{"postgres_password":"synthetic-private-value"}')
    received = []

    async def diagnostic_run(options, data, migrations, frontend):
        received.append(prepare_setup(options, data).status())

    monkeypatch.setattr("core_contracts.app.run", diagnostic_run)
    main()
    assert received[0]["error"] == "invalid_supervisor_options"
    assert received[0]["authority"] == "supervisor"
    assert "synthetic-private-value" not in caplog.text + capsys.readouterr().err
