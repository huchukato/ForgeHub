from forgehub_backend.executor import _apply_parameters


def test_apply_parameters_by_colon():
    workflow = {
        "1": {"class_type": "KSampler", "inputs": {"steps": 20, "cfg": 7.0}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": ""}},
    }
    patched = _apply_parameters(workflow, {"1:steps": 25, "2:text": "a cat"})
    assert patched["1"]["inputs"]["steps"] == 25
    assert patched["2"]["inputs"]["text"] == "a cat"


def test_apply_parameters_dot_separator():
    workflow = {
        "1": {"class_type": "KSampler", "inputs": {"steps": 20}},
    }
    patched = _apply_parameters(workflow, {"1.steps": 30})
    assert patched["1"]["inputs"]["steps"] == 30


def test_apply_parameters_ignores_invalid_keys():
    workflow = {"1": {"class_type": "KSampler", "inputs": {"steps": 20}}}
    patched = _apply_parameters(workflow, {"invalid": 10, "99:steps": 30})
    assert patched["1"]["inputs"]["steps"] == 20
