export function assignmentRelayFailure(response, profile) {
    if (response.status === 'indeterminate')
        return {
            success: false,
            error: 'Assignment outcome uncertain; retain operation identity before retrying',
            ...(profile === 'staff' ? {} : { data: undefined }),
            status: 'indeterminate',
            operationId: response.operationId,
        };
    const error = response.reason === 'UNAUTHORIZED'
        ? 'Unauthorized'
        : response.reason === 'SELF_ASSIGNMENT_ONLY'
            ? 'Access denied: Cannot assign other staff'
            : response.reason === 'RESOURCE_DENIED'
                ? profile === 'staff'
                    ? 'Claim not found or access denied'
                    : 'Claim not found'
                : response.reason === 'OPERATION_CONFLICT'
                    ? 'Assignment operation conflicts with an existing request'
                    : 'Invalid assignment request';
    return { success: false, error, ...(profile === 'staff' ? {} : { data: undefined }) };
}
//# sourceMappingURL=relay.source.js.map