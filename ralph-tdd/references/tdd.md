# TDD (reference)

Use when implementing features in the Ralph loop: red-green-refactor, one test at a time, behavior-focused tests.

## Loop (vertical slices only)

**One behavior per cycle.** Do not write all tests then all implementation (horizontal slices). That produces tests coupled to imagined behavior and structure.

```
RIGHT:  RED → GREEN (test1 → impl1), then RED → GREEN (test2 → impl2), ...
WRONG:  RED (test1, test2, test3…), then GREEN (impl1, impl2, impl3…)
```

- Write **one** failing test for one behavior.
- Write **minimal** code to pass.
- Repeat. Refactor only when green.

## Good tests

- Test **observable behavior** through the **public interface**.
- Describe **what** the system does, not how. Test name = specification.
- Survive internal refactors (no coupling to implementation).
- One logical assertion per test.

```typescript
// GOOD: behavior, public API
test("user can checkout with valid cart", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});

// BAD: implementation detail
test("checkout calls paymentService.process", async () => {
  const mockPayment = vi.mocked(paymentService);
  await checkout(cart, payment);
  expect(mockPayment.process).toHaveBeenCalledWith(cart.total);
});
```

Verify through the interface, not by peeking inside (e.g. don’t query the DB directly to assert; use `getUser(id)` and assert on the returned value).

## When to mock

**Mock at boundaries only**: external APIs, DB (sometimes), time/random, file system (sometimes).

**Don’t mock**: your own modules, internal collaborators, anything you control.

Design for testability: **inject dependencies** (pass them in) instead of creating them inside the function. That makes boundaries easy to mock.

## Interface design

- **Accept dependencies, don’t create them** (enables mocks).
- **Return results, don’t rely on side effects** for verification (easier to assert).
- **Small surface**: fewer methods and params → simpler tests.

## Refactor (after green only)

- Extract duplication; break long methods into helpers (test the public API).
- Prefer **deep modules**: small interface, rich implementation. Avoid shallow modules (big interface, thin implementation).
- Run tests after each refactor step.

## Checklist per cycle

- [ ] Test describes behavior, not implementation
- [ ] Test uses public interface only
- [ ] Test would survive internal refactor
- [ ] Code is minimal for this test
- [ ] No speculative features added

For deep module design and planning, see AGENTS.md conventions and the [progress format](progress-format.md) for tracking decisions across iterations.
