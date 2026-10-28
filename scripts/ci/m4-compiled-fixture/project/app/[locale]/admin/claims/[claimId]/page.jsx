import Scenario from '../../../../scenario-page';
export const runtime = 'nodejs';
export default async function Page({ params }) {
  return <Scenario params={params} area="admin" />;
}
