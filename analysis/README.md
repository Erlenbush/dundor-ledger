# Analysis in Python

The app's parser is TypeScript because it has to run in the browser, but every
number it computes can be exported as JSON and analyzed in Python. There is one
parser; Python consumes its output.

```
npm run build
npm run -s tojson fixtures/*.txt > fights.json
pip install pandas
python3 analysis/explore.py fights.json
```

The `-s` is not optional: without it npm prints its run banner to stdout and
the redirect captures it, so the file is not valid JSON.

`explore.py` flattens the JSON into three DataFrames (fights, turns, damage
rolls) and prints a few summaries. Treat it as a starting point for notebooks.
A fight is identified by `(source, fight)` — one pasted file can hold several
fights, so `source` alone is not a valid join or groupby key. A fight whose log
ends before a result has `won = <NA>` and is excluded from win rates rather
than counted as a loss.

If an analysis needs a number the JSON does not carry, add it to the analyzer
in `packages/parser/src/analyze.ts` so the app and Python stay in agreement,
rather than re-parsing the raw text here.

## Tests

```
pip install pandas pytest
python3 -m pytest analysis/
```

The suite unit-tests the frame builders against the export contract and runs
the script end to end, including the degenerate inputs: stat-less logs with no
damage bands, truncated logs with no outcome, multi-fight pastes, and the
error entries the CLI emits for unparseable sections.
