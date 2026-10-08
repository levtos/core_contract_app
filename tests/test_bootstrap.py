import pytest

from core_contracts.app import main


def test_invalid_options_never_log_configuration(tmp_path, monkeypatch, caplog, capsys):
    monkeypatch.setenv("CORE_CONTRACTS_DATA", str(tmp_path))
    (tmp_path / "options.json").write_text('{"postgres_password":"synthetic-private-value"}')
    with pytest.raises(SystemExit) as error:
        main()
    assert error.value.code == 1
    assert "startup_failed" in caplog.text
    assert "synthetic-private-value" not in caplog.text + capsys.readouterr().err
