import { getDefaultPromptVersionForWorkflow, getResponsesModelConfig } from './models';
import { routeAiModel } from './router';
import type { AiModelRoute, AiModelRoutingInput, AiResponsesWorkflowConfig } from './types';

export function getRoutedResponsesWorkflowConfig(
  input: AiModelRoutingInput
): AiResponsesWorkflowConfig & { route: AiModelRoute } {
  const route = routeAiModel(input);
  const workflow = route.workflow ?? 'policy_extract';
  const promptVersion = getDefaultPromptVersionForWorkflow(workflow);

  return {
    ...getResponsesModelConfig(route.selectedModel),
    workflow,
    promptVersion,
    promptCacheKey: `interdomestik:${workflow}:${route.selectedModel}:${promptVersion}`,
    route,
  };
}
