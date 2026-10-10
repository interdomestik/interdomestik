// Root-reviewed adoption epoch. Candidate configuration cannot re-anchor this trust.
export const ADOPTION = Object.freeze({
  commit: '278e33ab0dd448547fa81d4b0ff122b4d69c901e',
  tree: '4f9330417466b4f7bee68349e7183db22a5260ff',
  files: {
    'package.json': '1f9e4b4b6742ec482c5c00b07a546bfdf0060faeb78cd327c52301c1886da0d7',
    'apps/web/tsconfig.json': 'ae48bed7cd2f03614366f5cc61dd4e774f15a2d158fa9a49f0d8349dfac53b0a',
    'packages/database/package.json':
      '533d163f5e6c4ca9cab74e57ceaf1818f2018a3d1eb04e9761205d7f3e5ee9fa',
    'packages/database/src/index.ts':
      'b391dce38b6a3a94caf4e92091a088929a2f007fb6dc226ef167bf52f5c4293d',
    'packages/database/src/tenant.ts':
      '443a294899a392906c18d54ddc80a6c316777e3352bae4d4e457bbf3155581ef',
    'packages/database/src/db.ts':
      '08ab9d13efba891551ec95999ff0403f16045470a7dff6211cb9535d29ba47e2',
    'packages/database/src/rls-role-assertion.ts':
      '8b637ce461facbc7a682ef2727e741cfaae1a8a2b53aa46ca2a64dcf8eaa352b',
    'packages/database/src/rls-role-readiness.ts':
      '0f53217fba93727a500000638d7e82cf44fa64ba6d2ce67c23a8b1257701c5a8',
    'scripts/check-db-access-guard.mjs':
      'cbd5172cb69bd6d7a628fe258829f48e3d486fd447d19ee95ee19fee4f1bb3ac',
    'scripts/ci/db-access-aliases.mjs':
      '0db95ae412bf46c16f30d17a42238aa5773311e8829629f6374218cf5c249e19',
    'scripts/ci/db-access-constants.mjs':
      '805870b4c970b1ac0e308ffd51f64162fe0e340bad2bca8a4c93b3e1e9cf2048',
    'scripts/ci/db-access-posture.mjs':
      'a474eb753e4cbd2bbee3fe8aa0458b46c0085a3813f8e5ebcabf8ec2a5a84e6b',
    'scripts/ci/db-access-sensitive-entry.mjs':
      'd4796f6a9e062de0912392d07173b3a5e07a419dcd51140a0899ebf73abfd02f',
    'scripts/ci/source-strip-comments.mjs':
      'd87025f9686df88e8311b5e7c734aca4a90c10784aeb5939313d9c8e0496caaf',
    'scripts/ci/db-access-baseline.json':
      '438b856b913d2946088b9c0f925dd07818b81ea82bad8d3468c2470a2f1131e9',
    'scripts/ci/db-access-guard.test.mjs':
      'fb415d6834f47a3e56e4b2b5f0cb16f0890fa889ac3c5f3059c4fbe4990da6ed',
    'scripts/ci/db-access-guard-t302c.test.mjs':
      '9792ead7066b11b2d5ca8b8466ee72808941ecf15f8c7d97ea078d7127e4e14e',
    'scripts/ci/db-access-guard-distinct-on.test.mjs':
      '9a0461ff9502a59336a01d33db26ab5d32b709160b677ce0d39953f465c4a2ba',
    'scripts/ci/db-access-guard-test-utils.mjs':
      'ea30a718379b0cfaf0de1834d473fb1aa6fb6dec2ce14b58114a4f71e7cc940e',
    '.github/workflows/ci.yml': '39c433d419a98cf36758adc57d9f129fd0ce96f51288115d97db7761b05ec957',
    '.github/actions/setup/action.yml':
      '60b2957fc089499e9eb64567d670db6ff02abb6e32a6851ff21a927cd2316dbe',
    'scripts/ci/z620-parity.json':
      '93eace80bd008b91a672acf250aa9e37a66aded77321377bd77cbf93f777d0a2',
    'scripts/ci/z620-parity-lib.mjs':
      '540c5a545301c77942fed91c7a287eec8d3c57c1f5c527b684350e36d1477348',
    'docs/plans/current-program.md':
      'aba2215bfbfca806c072ec9ce13f8b9194220e468f83af1a6696a6d4dcd2ce9f',
    'docs/plans/current-tracker.md':
      '9551e86ab334b662c5b3c9ece9b4a7a3e4ac27ff31ad47315250d35d86080220',
  },
  critical: [
    'packages/database/src/tenant.ts',
    'packages/database/src/db.ts',
    'packages/database/src/rls-role-assertion.ts',
    'packages/database/src/rls-role-readiness.ts',
  ],
});
