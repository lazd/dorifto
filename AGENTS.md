1. Don't write superfluous tests or hardcode data that could be exported from the application and re-used in tests. We want maintainable, clean, to-the-point testing, not full coverage for no reason.
2. Keep it simple. If a solution for a problem that should be simple ends up huge, question whether there is a simpler way.
3. Keep design system principles in mind. Don't write unmaintainable CSS, use custom properties to capture repeated values, make sure CSS styles are re-usable and generically named.
4. Keep an eye on performance. Make sure changes don't introduce performance problems, such as updating the DOM on every frame, causing repaints that could be avoided, etc.
