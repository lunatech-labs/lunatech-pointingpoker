# When a step gets a plan document

Not every step in `docs/superpowers/specs/` has a plan here, and the gaps are
deliberate. This file says which steps get one so that a missing plan reads as a
rule being followed rather than as a question to reopen at each step.

## The two axes

**A plan document is an execution vehicle.** Every one in this directory opens by
telling an agentic worker to implement it task by task, and that is what they are
for: decomposing work, naming the files it touches, and handing it to someone, or
something, that was not present for the design. So a plan is worth writing when
the surface area is large enough that the work needs decomposing and handing over.

**Brainstorming is a different axis, and it scales with decision weight.** How
much the change alters behaviour people see, or commits the design to something
later steps inherit, has little to do with how many lines it takes. A change of a
dozen lines can need a long design conversation and no plan at all.

Reading those two together:

- Large surface area, whatever the decision weight: write a plan. The work needs
  decomposing whether or not the design was contentious.
- Small surface area, high decision weight: brainstorm properly, settle the design
  with the product owner, then execute directly under test-driven development. No
  plan, because there is no handover.
- Small surface area, low decision weight: TDD alone.

## What has to happen when there is no plan

A plan carries three things that then need another home, and losing them silently
is the failure mode this file exists to prevent.

**The design's reasoning goes in the living spec**, not only in the commit
message. `docs/superpowers/specs/2026-08-31-protocol-target-architecture-design.md`
is amended by the step that lands, which every step so far has done, and it is
what the next reader opens. A commit message is read once.

**Test-driven development is the discipline**, since no plan enumerates the cases:
write the test, watch it fail for the reason you expect, then implement.

**Say plainly what was not test-driven.** Presentation is the usual case, a fade,
a cursor, an icon. Verifying it by eye is often the right call, and a plan would
have recorded that choice under its deviations. Without one, the commit message
and the review conversation are where it has to be said, rather than left to be
inferred from the absence of a test.

## The record so far

Steps 0 (two plans), 1 and 2 have plans. Each was large: the browser harness, the
snapshot protocol, and the redaction with the test rewrites it forced.

Steps 3 and 3a have none. Step 3 was a filter and a template guard, five lines of
production code. Step 3a was around twenty-five, but it changed behaviour every
participant sees, so it earned a long brainstorm and the spec amendments that came
out of it. Both were executed directly under TDD in the session that designed
them.

Step 4 will have one. It rewrites the actor's state model and `RoomSpec` with it.
