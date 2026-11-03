# Wariant partii nie wynika ze sposobu zakończenia

**Problem:** przegląd rozpoznawał partię papierową po `reason === "points"`, więc partia papierowa zakończona poddaniem lub czasem pokazywała kolory i pustą planszę klasyczną. Testy tego nie wyłapały, bo wszystkie przykłady papierowe kończyły się na punkty.
**Reguła:** gdy zachowanie zależy od wariantu, przekaż `variant` z serwera, nie zgaduj go z innego pola. Testuj każdy sposób zakończenia partii dla każdego wariantu.
**Powiązane:** #230.
