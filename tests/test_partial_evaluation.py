import copy

from core_contracts.persistence import MemoryStore
from core_contracts.runtime import Runtime

from .conftest import activate
from .test_declarative import observation
from .test_phase1a import add_source, contract


async def test_affected_graph_matches_full_evaluation_including_expiry(runtime, config):
    add_source(config, "b")
    config["sources"][1]["freshness"].update(mode="periodic_ttl", interval_s=10)
    config["contracts"].extend(
        [
            contract("b", "echo", ["source.b"]),
            contract("not", "boolean", ["fixture.echo"], {"operator": "not"}),
        ]
    )
    await activate(runtime, config)
    reference_store = MemoryStore()
    reference_store.state = copy.deepcopy(runtime.store.state)
    full = Runtime(reference_store, runtime.clock, runtime.types)
    full.state = runtime.state.clone()
    full.persistence = True
    full.reuse_unaffected = False
    for step, (name, value) in enumerate((("b", True), ("a", False), ("a", True))):
        item = observation(runtime, value, name).model_copy(update={"ingest_seq": step + 1})
        await runtime.submit("observation", item)
        await full.process("observation", item)
        assert runtime.snapshot()["contracts"] == full.snapshot()["contracts"]
    assert runtime.evaluation_stats == {"evaluated": 2, "reused": 1}
    runtime.clock.advance(11)
    item = observation(runtime, False).model_copy(update={"ingest_seq": 100})
    await runtime.submit("observation", item)
    await full.process("observation", item)
    assert runtime.snapshot()["contracts"] == full.snapshot()["contracts"]
    assert runtime.evaluation_stats["reused"] == 0
