import { deliveryDispositionCandidates, deliveryDispositionReviewIds } from './pr-delivery-api.mjs';

const MAX_PAGES = 100;

async function collectThreads(client, number) {
  const [owner, name] = client.repository.split('/');
  const nodes = [];
  let cursor = null;
  let complete = true;
  for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber += 1) {
    const data = await client.graphql(
      `query($owner:String!,$name:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100,after:$cursor){pageInfo{hasNextPage endCursor}nodes{isResolved comments(first:100){pageInfo{hasNextPage}nodes{url author{login}}}}}}}}`,
      { owner, name, number, cursor }
    );
    const page = data.repository.pullRequest.reviewThreads;
    nodes.push(...page.nodes);
    if (page.nodes.some(thread => thread.comments.pageInfo.hasNextPage)) complete = false;
    if (!page.pageInfo.hasNextPage) return { values: nodes, complete };
    cursor = page.pageInfo.endCursor;
    if (!cursor) throw new Error('review-thread pagination cursor missing');
  }
  return { values: nodes, complete: false };
}
export async function collectFeedback(client, pull) {
  const base = `repos/${client.repository}`;
  const [reviews, issueComments, reviewComments, threads] = await Promise.all([
    client.pages(`${base}/pulls/${pull.number}/reviews`),
    client.pages(`${base}/issues/${pull.number}/comments`),
    client.pages(`${base}/pulls/${pull.number}/comments`),
    collectThreads(client, pull.number),
  ]);
  const resolvedComments = new Set(
    threads.values
      .filter(thread => thread.isResolved)
      .flatMap(thread => thread.comments.nodes.map(comment => comment.url))
  );
  const normalizedIssueComments = issueComments.values.map(item => ({
    author: item.user?.login ?? '',
    authorAssociation: item.author_association ?? '',
    body: item.body ?? '',
    createdAt: item.updated_at ?? item.created_at ?? '',
  }));
  const dispositionAuthors = [
    ...new Set(
      deliveryDispositionCandidates(normalizedIssueComments, pull.head.sha).map(item => item.author)
    ),
  ];
  const dispositionPermissions = new Map(
    await Promise.all(
      dispositionAuthors.map(async author => [
        author,
        (await client.request(`${base}/collaborators/${author}/permission`)).permission,
      ])
    )
  );
  const authorizedIssueComments = normalizedIssueComments.map(item => ({
    ...item,
    permission: dispositionPermissions.get(item.author) ?? '',
  }));
  return {
    headSha: pull.head.sha,
    disposedReviewIds: deliveryDispositionReviewIds(authorizedIssueComments, pull.head.sha),
    pagination: {
      checks: true,
      annotations: true,
      reviews: reviews.complete,
      issueComments: issueComments.complete,
      reviewComments: reviewComments.complete,
      threads: threads.complete,
    },
    unresolvedThreads: threads.values.filter(item => !item.isResolved),
    pendingReviewers: [
      ...(pull.requested_reviewers ?? []).map(item => item.login),
      ...(pull.requested_teams ?? []).map(item => item.slug),
    ],
    reviews: reviews.values.map(item => ({
      id: item.id,
      author: item.user?.login ?? '',
      commitId: item.commit_id ?? '',
      state: item.state ?? '',
      body: item.body ?? '',
      submittedAt: item.submitted_at ?? '',
    })),
    issueComments: authorizedIssueComments,
    reviewComments: reviewComments.values.map(item => ({
      author: item.user?.login ?? '',
      commitId: item.commit_id ?? '',
      body: item.body ?? '',
      createdAt: item.updated_at ?? item.created_at ?? '',
      resolved: resolvedComments.has(item.html_url),
    })),
  };
}
