# Repair a provider helper

1. Record the provider, pageId, helper, argument, and failed result.
2. Set `CDP=$(bin/cdp-id.sh "$PAGE")`. Call chrome-existing.take_snapshot with
   pageId `$CDP`. Inspect the changed control or response. For a narrow DOM
   query, run a small function file with `bin/js.sh "$PAGE"`.
3. Find a stable selector: role, label, test ID, then stable class fragment.
   Check visible matches, hidden fallback editors, dialogs, and disabled entries.
4. Fix the provider JS function. Keep one function expression per file.
   Find elements inside the function. Accept data arguments, never snapshot uids.
5. Update the provider SKILL.md Known quirks. Add the changed HTML to a fixture
   and a regression assertion to the JS tests. Follow [improve](improve.md).
6. Rerun the helper against the same live page. Check state, insert, send, and
   read only as needed for the repair. Avoid resending an accepted prompt.
7. Run the app checks. A repair is complete when the fixture test passes and the
   failed live operation returns the expected result. Report any live check gap.
