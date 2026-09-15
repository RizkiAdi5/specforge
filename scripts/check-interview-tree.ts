import { getNextQuestion } from "../lib/interview/engine";
import { saasCrudTree } from "../lib/interview/trees/saas-crud";
import type { InterviewAnswers } from "../lib/interview/types";

function run(answers: InterviewAnswers) {
  return getNextQuestion(saasCrudTree, answers, "STANDARD");
}

// Path A: needsAuth=true, needsBilling=true — branches must expand and appear.
{
  const answers: InterviewAnswers = {
    appName: "Fixly",
    targetUser: "tukang servis AC",
    coreProblem: "susah jadwalin panggilan",
    mainEntities: "customer, jadwal, invoice",
    needsAuth: true,
  };
  const r = run(answers);
  console.assert(r.done === false && r.question.slot === "authProviders", "Path A: expected authProviders after needsAuth=true");
}

// Path B: needsAuth=false, needsBilling=false — branch questions must be skipped entirely.
{
  const answers: InterviewAnswers = {
    appName: "Fixly",
    targetUser: "tukang servis AC",
    coreProblem: "susah jadwalin panggilan",
    mainEntities: "customer, jadwal, invoice",
    needsAuth: false,
    multiTenant: false,
    needsBilling: false,
    keyWorkflow: "masuk -> pilih jadwal -> selesai",
    mustHaveFeatures: "jadwal, notifikasi, riwayat",
  };
  const r = run(answers);
  console.assert(r.done === true, "Path B: expected done=true once required slots filled, skipping authProviders/billingModel");
  console.assert(!("authProviders" in answers), "Path B: authProviders must never have been asked");
  console.assert(!("billingModel" in answers), "Path B: billingModel must never have been asked");
}

// Path C: LITE spec level caps at 8 questions even if required slots remain unfilled.
{
  const answers: InterviewAnswers = {
    appName: "Fixly",
    targetUser: "tukang servis AC",
    coreProblem: "susah jadwalin panggilan",
    mainEntities: "customer, jadwal, invoice",
    needsAuth: true,
    authProviders: "Email/Password",
    multiTenant: false,
    needsBilling: true,
  };
  console.assert(Object.keys(answers).length === 8, "Path C setup: expected exactly 8 answers so far");
  const r = getNextQuestion(saasCrudTree, answers, "LITE");
  console.assert(r.done === true, "Path C: expected done=true at LITE's 8-question cap, even with billingModel/keyWorkflow/mustHaveFeatures still required and unanswered");
}

console.log("OK: lib/interview/trees/saas-crud.ts satisfies T-006 DoD (3 distinct paths)");
