import { NextResponse } from 'next/server';
import { loadDeploymentMetadata } from '@agentic-support/observability';

export function GET() {
  return NextResponse.json(loadDeploymentMetadata('web'));
}
