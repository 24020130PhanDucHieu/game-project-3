// =============================================================================
// SUBMISSION STUDIO MODULE - CODE DRAFTING & SUBMISSION
// =============================================================================

import { ApiClient } from '../api/client.js';

export async function saveDraftCode(tournamentId, matchId, studentId, language, codeContent) {
  return await ApiClient.post(`/api/tournaments/${tournamentId}/matches/${matchId}/draft-code`, {
    student_id: studentId,
    language: language,
    code_content: codeContent
  });
}

export async function submitFinalCode(tournamentId, matchId, studentId, language, codeContent) {
  return await ApiClient.post(`/api/tournaments/${tournamentId}/matches/${matchId}/code`, {
    student_id: studentId,
    language: language,
    code_content: codeContent
  });
}
