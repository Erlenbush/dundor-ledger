# Analysis in Python

The app's parser is TypeScript because it has to run in the browser, but every
number it computes can be exported as JSON and analyzed in Python. There is one
parser; Python consumes its output.

```
npm run build
npm run tojson fixtures/*.txt > fights.json
pip install pandas
python analysis/explore.py fights.json
```

`explore.py` flattens the JSON into three DataFrames (fights, turns, damage
rolls) and prints a few summaries. Treat it as a starting point for notebooks.

If an analysis needs a number the JSON does not carry, add it to the analyzer
in `packages/parser/src/analyze.ts` so the app and Python stay in agreement,
rather than re-parsing the raw text here.
