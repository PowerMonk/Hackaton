# Copilot Instructions for Simulation Algorithms Repository (Aligned)

---

### 🎯 Project Context

This repository collects implementations of several pseudo-random number generation algorithms used in the Simulation class. The goal is to provide clear, runnable, self-contained scripts that students can run, inspect, and modify. The repository also contains the file `Class_notes.md` which are the author's actual class notes — reviewers and contributors should read that file to confirm which algorithms are already implemented and which still need implementations.

---

### 🤖 Desired Copilot Behavior (Updated / Aligned with user rules)

- Code generation must produce standalone Python scripts named in Spanish (example filenames below). Each script must:
  - Be fully self-contained: prompt the user interactively for every required parameter (seeds, D, a, c, m, k, n, etc.), implement the algorithm, and print results.
  - Not import project-local utility modules — do not reuse shared utils. It may optionally import third-party libraries (e.g., `rich`) but must gracefully fall back if they're not installed.
  - Expose a `main()` function and run interactively when executed as `__main__`.
  - Optionally accept CLI flags (via `argparse`) to allow non-interactive demo runs, but interactive prompting must always be present as the default.
- Maintain a consistent script structure across algorithms:
  - small helper functions (within the same file) for input parsing/validation,
  - a core generator function that yields or returns the sequence,
  - `main()` that orchestrates prompting, generation, and display.
- Documentation and comments:
  - Add short comments in English that explain key steps (loops, digit extraction, modular math, and input validation).
  - Keep in-file documentation concise and focused.
- Display / Visualization:
  - Attempt to use `rich` for nicer console tables/plots; if `rich` is unavailable, fall back to plain text output.
  - Print the generated sequence (first N values) and a simple frequency/summary table.
- Validation and constraints:
  - Validate inputs and emit helpful error messages (e.g., require D >= 3 for mid-square where appropriate; require odd seed for multiplicative when specified by theory).
  - Use integer checks and sensible bounds.
- Testing and files:
  - Do NOT create any test files, unit tests, or CI configuration as part of these scripts.
- Consistency with implemented algorithms:
  - Follow the formulas in the class notes:
    - Mid-square: square seed, take middle D digits.
    - Mid-product: multiply last two seeds, take middle D digits.
    - Constant multiplier: multiply by constant `a`, take middle D digits.
    - LCG: x\_{i+1} = (a\*x_i + c) mod m
    - Multiplicative: x\_{i+1} = (a\*x_i) mod m
    - Additive: x*{i} = (x*{i-1} + x\_{i-k}) mod m
  - Normalize output to the range [0,1] where appropriate (e.g., r_i = x_i / 10\*\*D or r_i = x_i / (m-1)).

---

### 🧩 Filenames and minimal structure (must use these Spanish names)

- Cuadrados_medios.py
- Productos_medios.py
- Multiplicador_constante.py
- Lineal_congruencial.py
- Multiplicativo.py
- Aditivo.py
- Congruencial_cuadratico.py
- Blum_Blum_Shub.py
- (Optional) run_algos.py — small runner that imports each Spanish script and calls `main()`; runner must not move logic into shared modules.

Each file should contain:

- a brief header comment (purpose + usage),
- input parsing/validation,
- a generator function (or loop) implementing the algorithm,
- display code (rich fallback),
- `if __name__ == '__main__': main()`.

---

### 💡 Helpful Hints for Copilot Suggestions

- When suggesting a function signature like `def mid_square(seed: int, d: int, n: int) -> List[float]:`, also suggest:
  - Input checks (seed has exactly D digits or allow left-padding with zeros),
  - How to extract middle digits: convert to string, zfill to the needed length, slice center,
  - Normalization: `r = x / (10**d)`.
- For congruential generators, suggest using fast modular arithmetic and normalization `r_i = x_i / (m-1)`.
- Recommend a demo mode that runs a small example from the class notes when the user requests it.

---

### 🚫 Restrictions (enforced)

- Do not create or suggest shared `utils.py` or other project-local helper modules — every script must be runnable by itself.
- Do not generate test files.
- Keep filenames and user-facing prompts in Spanish so students can recognize the algorithm.
- Avoid excessive code generation when the user explicitly requested a minimal or incremental change. When the user asked for full scripts, produce the full script; otherwise, prefer smaller suggestions.

---

### 📌 Summary

Generate clear, self-contained, Spanish-named scripts that:

- ask for inputs interactively,
- implement the algorithm end-to-end inside the same file,
- provide nice console output (use `rich` if available),
- and do not introduce tests or shared
