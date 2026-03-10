# Implementation Plan: Admin Assignment & Progress Tracking Features

## Overview

Enable administrators to efficiently manage company assignments and track committee member progress. This includes bulk assignment capabilities and a dedicated admin dashboard for monitoring team performance.

## User Stories

### User Story 1: Bulk Company Assignment
**As an admin**, I want to select multiple companies and assign them all to a committee member at once, so that I can efficiently distribute workload.

**Acceptance Criteria**:
- Multi-select checkbox functionality on company list views
- **Selection counter** showing "X companies selected" in real-time
- **Shift+click range selection**: Click one company, hold Shift, click another to select all in between
- Assign button appears when companies are selected
- Dropdown to select committee member from list
- Bulk update to Google Sheets on confirmation
- Visual feedback on assignment completion
- Clear selection button to deselect all

### User Story 2: Individual Company Assignment
**As an admin**, I want to change the assignment of a single company, so that I can reallocate work as needed.

**Acceptance Criteria**:
- Edit company details shows assignee dropdown
- List of all committee members available
- Save updates assignee (`pic` field) in Google Sheets
- Real-time UI update on save

### User Story 3: Committee Progress Dashboard
**As an admin**, I want to see a dashboard showing each committee member's progress, so that I can identify bottlenecks and redistribute work.

**Acceptance Criteria**:
- Dedicated `/admin/progress` page
- Table showing each member with key metrics
- Metrics: Total assigned, Contacted, Replied, Completed, Stalled
- Sort by different metrics
- Click member to see their assigned companies

---

## Current State Analysis

### ✅ Existing Infrastructure
- **Committee Members Sheet**: Already exists with `name`, `email`, `role` columns
- **Admin Role Detection**: `/api/me` returns `role` field from Committee_Members sheet
- **Company Data Structure**: `pic` field stores assignee name
- **Update API**: `/api/update` can modify company data
- **All Companies Page**: Shows all companies in table format

### 🔧 Needs Implementation
- Admin role checking and route protection
- Multi-select UI component
- Bulk assignment API endpoint
- Committee member progress aggregation
- Admin progress dashboard page
- Assignment change tracking/logging

---

## Technical Approach

### Phase 1: Admin Role Detection & Protection

#### 1.1 Update Role-Based Access Control
**Files**: `lib/auth.ts`, `pages/api/me.ts`, `contexts/CurrentUserContext.tsx`

**Current**: User context includes `role` field, but no enforcement

**New Implementation**:
```typescript
// In CurrentUserContext.tsx
export interface CurrentUser {
    name: string | null;
    email: string | null;
    role: string | null;
    isCommitteeMember: boolean;
    isAdmin: boolean; // NEW
}

// In pages/api/me.ts
return res.status(200).json({
    name: committeeMember.name,
    email: committeeMember.email,
    role: committeeMember.role,
    authenticated: true,
    isCommitteeMember: true,
    isAdmin: committeeMember.role?.toLowerCase() === 'admin', // NEW
});
```

#### 1.2 Create Admin Route Wrapper
**File**: [NEW] `components/AdminRoute.tsx`

```typescript
import { useCurrentUser } from '@/contexts/CurrentUserContext';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || !user.isAdmin)) {
      router.push('/');
    }
  }, [loading, user, router]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user?.isAdmin) {
    return null;
  }

  return <>{children}</>;
}
```

---

### Phase 2: Bulk Company Assignment

#### 2.1 Add Multi-Select to All Companies Page
**File**: `pages/companies.tsx`

**Changes**:
1. Add state for selected company IDs and last clicked index:
```typescript
const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
```

2. Add checkbox click handler with shift-click support:
```typescript
const handleCheckboxClick = (companyId: string, index: number, event: React.MouseEvent) => {
  const newSelected = new Set(selectedCompanies);
  
  // Shift+click range selection
  if (event.shiftKey && lastSelectedIndex !== null && filteredCompanies) {
    const start = Math.min(lastSelectedIndex, index);
    const end = Math.max(lastSelectedIndex, index);
    
    // Select all companies in range
    for (let i = start; i <= end; i++) {
      if (filteredCompanies[i]) {
        newSelected.add(filteredCompanies[i].id);
      }
    }
  } else {
    // Normal click - toggle selection
    if (newSelected.has(companyId)) {
      newSelected.delete(companyId);
    } else {
      newSelected.add(companyId);
    }
  }
  
  setSelectedCompanies(newSelected);
  setLastSelectedIndex(index);
};
```

3. Add "Select All" checkbox in table header
4. Add checkbox column for each row with click handler:
```tsx
<td className="px-4 py-3">
  <input
    type="checkbox"
    checked={selectedCompanies.has(company.id)}
    onClick={(e) => {
      e.stopPropagation(); // Prevent row click
      handleCheckboxClick(company.id, index, e);
    }}
    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
  />
</td>
```

5. Add enhanced bulk action bar with counter when companies selected:

```tsx
{selectedCompanies.size > 0 && (
  <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-4 z-50 border border-blue-500">
    {/* Selection Counter */}
    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-700 rounded-md">
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
      <span className="font-semibold text-lg">{selectedCompanies.size}</span>
      <span className="text-blue-100">
        {selectedCompanies.size === 1 ? 'company' : 'companies'} selected
      </span>
    </div>
    
    {/* Assign Dropdown */}
    <select 
      className="px-4 py-2 bg-white text-slate-900 rounded-lg font-medium border-2 border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
      onChange={(e) => handleBulkAssign(e.target.value)}
      defaultValue=""
    >
      <option value="" disabled>Assign to...</option>
      {committeeMembers.map(member => (
        <option key={member.name} value={member.name}>{member.name}</option>
      ))}
    </select>
    
    {/* Clear Selection Button */}
    <button 
      onClick={() => {
        setSelectedCompanies(new Set());
        setLastSelectedIndex(null);
      }}
      className="px-4 py-2 bg-blue-500 hover:bg-blue-400 rounded-lg font-medium transition-colors flex items-center gap-2"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
      Clear
    </button>
  </div>
)}
```

6. Add visual feedback for shift-click hint:
```tsx
{/* Hint text below table when items are selected */}
{selectedCompanies.size > 0 && (
  <div className="mt-4 text-sm text-slate-600 text-center">
    💡 Tip: Hold <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-mono">Shift</kbd> and click to select a range
  </div>
)}
```

#### 2.2 Create Bulk Assignment API
**File**: [NEW] `pages/api/bulk-assign.ts`

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import { google } from 'googleapis';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../lib/auth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check admin permission
  const session = await getServerSession(req, res, authOptions);
  // ... fetch user from Committee_Members sheet
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { companyIds, assignee } = req.body;

  // Validate inputs
  if (!Array.isArray(companyIds) || !assignee) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SPREADSHEET_ID_2;

    // Read current data to find row numbers
    const dataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Outreach Tracker!A:Z',
    });

    const rows = dataResponse.data.values || [];
    const headers = rows[0];
    const picColumnIndex = headers.indexOf('pic');

    // Build batch update requests
    const updates = [];
    for (const companyId of companyIds) {
      const rowIndex = rows.findIndex(row => row[0] === companyId);
      if (rowIndex > 0) {
        updates.push({
          range: `Outreach Tracker!${String.fromCharCode(65 + picColumnIndex)}${rowIndex + 1}`,
          values: [[assignee]],
        });
      }
    }

    // Execute batch update
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: updates,
      },
    });

    // Log the assignment action
    const logEntry = {
      timestamp: new Date().toISOString(),
      user: session.user.name,
      action: 'BULK_ASSIGN',
      details: `Assigned ${companyIds.length} companies to ${assignee}`,
      companyIds: companyIds.join(','),
    };

    // Append to logs sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Logs!A:E',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          logEntry.timestamp,
          logEntry.user,
          logEntry.action,
          logEntry.details,
          logEntry.companyIds,
        ]],
      },
    });

    return res.status(200).json({ 
      success: true, 
      updated: updates.length 
    });
  } catch (error) {
    console.error('Bulk assign error:', error);
    return res.status(500).json({ error: 'Failed to assign companies' });
  }
}
```

#### 2.3 Frontend Bulk Assignment Handler
**File**: `pages/companies.tsx`

```typescript
const handleBulkAssign = async (assignee: string) => {
  if (!assignee || selectedCompanies.size === 0) return;

  const confirmed = window.confirm(
    `Assign ${selectedCompanies.size} companies to ${assignee}?`
  );

  if (!confirmed) return;

  try {
    const response = await fetch('/api/bulk-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyIds: Array.from(selectedCompanies),
        assignee,
      }),
    });

    if (response.ok) {
      // Show success message
      alert(`Successfully assigned ${selectedCompanies.size} companies to ${assignee}`);
      // Clear selection
      setSelectedCompanies(new Set());
      // Refresh data
      fetchData();
    } else {
      alert('Failed to assign companies');
    }
  } catch (error) {
    console.error('Assignment error:', error);
    alert('An error occurred');
  }
};
```

---

### Phase 3: Individual Company Assignment

#### 3.1 Update Company Modal/Details
**File**: `components/CompanyModal.tsx` (or company details page)

**Add assignee dropdown in edit mode**:

```tsx
<div>
  <label className="block text-sm font-medium text-slate-700 mb-2">
    Assigned To (PIC)
  </label>
  <select
    value={companyData.pic || ''}
    onChange={(e) => setCompanyData({ ...companyData, pic: e.target.value })}
    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg"
  >
    <option value="">Unassigned</option>
    {committeeMembers.map(member => (
      <option key={member.name} value={member.name}>{member.name}</option>
    ))}
  </select>
</div>
```

#### 3.2 Fetch Committee Members
**File**: [NEW] `pages/api/committee-members.ts`

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import { getCommitteeMembers } from '../../lib/committee-members';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const members = await getCommitteeMembers();
    return res.status(200).json({ members });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch members' });
  }
}
```

---

### Phase 4: Admin Progress Dashboard

#### 4.1 Create Progress Aggregation API
**File**: [NEW] `pages/api/admin/progress.ts`

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../../lib/auth';
import { getCommitteeMembers } from '../../../lib/committee-members';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Check admin permission
  const session = await getServerSession(req, res, authOptions);
  const members = await getCommitteeMembers();
  const user = members.find(m => m.email === session?.user?.email);
  
  if (user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    // Fetch all companies
    const dataResponse = await fetch(process.env.NEXTAUTH_URL + '/api/data');
    const { companies } = await dataResponse.json();

    // Aggregate stats per committee member
    const memberStats = new Map();

    members.forEach(member => {
      memberStats.set(member.name, {
        name: member.name,
        email: member.email,
        totalAssigned: 0,
        toContact: 0,
        contacted: 0,
        replied: 0,
        negotiating: 0,
        completed: 0,
        stalled: 0,
        followUps: 0,
      });
    });

    companies.forEach(company => {
      const pic = company.pic || 'Unassigned';
      if (!memberStats.has(pic)) {
        memberStats.set(pic, {
          name: pic,
          email: null,
          totalAssigned: 0,
          toContact: 0,
          contacted: 0,
          replied: 0,
          negotiating: 0,
          completed: 0,
          stalled: 0,
          followUps: 0,
        });
      }

      const stats = memberStats.get(pic);
      stats.totalAssigned++;
      stats.followUps += company.followUpsCompleted || 0;

      // Count by status
      const status = company.status || 'To Contact';
      if (status === 'To Contact') stats.toContact++;
      else if (status === 'Contacted') stats.contacted++;
      else if (status === 'Replied') stats.replied++;
      else if (status === 'Negotiating') stats.negotiating++;
      else if (['Closed', 'Succeeded', 'Completed'].includes(status)) stats.completed++;

      // Check if stalled
      if (company.lastUpdated) {
        const daysSince = (Date.now() - new Date(company.lastUpdated).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince > 7) stats.stalled++;
      }
    });

    return res.status(200).json({
      progress: Array.from(memberStats.values()),
    });
  } catch (error) {
    console.error('Progress fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch progress' });
  }
}
```

#### 4.2 Create Admin Progress Dashboard Page
**File**: [NEW] `pages/admin/progress.tsx`

```tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import AdminRoute from '../../components/AdminRoute';
import { ChartBarIcon, UserGroupIcon } from '@heroicons/react/24/outline';

interface MemberProgress {
  name: string;
  email: string | null;
  totalAssigned: number;
  toContact: number;
  contacted: number;
  replied: number;
  negotiating: number;
  completed: number;
  stalled: number;
  followUps: number;
}

export default function AdminProgressPage() {
  const router = useRouter();
  const [progress, setProgress] = useState<MemberProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<keyof MemberProgress>('totalAssigned');

  useEffect(() => {
    fetchProgress();
  }, []);

  const fetchProgress = async () => {
    try {
      const res = await fetch('/api/admin/progress');
      const data = await res.json();
      setProgress(data.progress || []);
    } catch (error) {
      console.error('Failed to load progress', error);
    } finally {
      setLoading(false);
    }
  };

  const sortedProgress = [...progress].sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    return typeof aVal === 'number' && typeof bVal === 'number' 
      ? bVal - aVal 
      : 0;
  });

  return (
    <AdminRoute>
      <Layout title="Committee Progress | Admin">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl">
              <ChartBarIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Committee Progress</h1>
              <p className="text-slate-600 mt-1">Track team performance and workload distribution</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 bg-slate-50 border-b">
              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <p className="text-sm text-slate-600 mb-1">Total Members</p>
                <p className="text-2xl font-bold text-slate-900">{progress.length}</p>
              </div>
              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <p className="text-sm text-slate-600 mb-1">Total Assigned</p>
                <p className="text-2xl font-bold text-blue-600">
                  {progress.reduce((sum, m) => sum + m.totalAssigned, 0)}
                </p>
              </div>
              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <p className="text-sm text-slate-600 mb-1">Total Completed</p>
                <p className="text-2xl font-bold text-green-600">
                  {progress.reduce((sum, m) => sum + m.completed, 0)}
                </p>
              </div>
              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <p className="text-sm text-slate-600 mb-1">Total Stalled</p>
                <p className="text-2xl font-bold text-red-600">
                  {progress.reduce((sum, m) => sum + m.stalled, 0)}
                </p>
              </div>
            </div>

            {/* Progress Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Member</th>
                    <th className="text-center px-4 py-4 text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100" onClick={() => setSortBy('totalAssigned')}>
                      Total
                    </th>
                    <th className="text-center px-4 py-4 text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100" onClick={() => setSortBy('toContact')}>
                      To Contact
                    </th>
                    <th className="text-center px-4 py-4 text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100" onClick={() => setSortBy('contacted')}>
                      Contacted
                    </th>
                    <th className="text-center px-4 py-4 text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100" onClick={() => setSortBy('replied')}>
                      Replied
                    </th>
                    <th className="text-center px-4 py-4 text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100" onClick={() => setSortBy('completed')}>
                      Completed
                    </th>
                    <th className="text-center px-4 py-4 text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100" onClick={() => setSortBy('stalled')}>
                      Stalled
                    </th>
                    <th className="text-center px-4 py-4 text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100" onClick={() => setSortBy('followUps')}>
                      Follow-ups
                    </th>
                    <th className="text-center px-4 py-4 text-sm font-semibold text-slate-700">Completion %</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProgress.map((member, idx) => {
                    const completionRate = member.totalAssigned > 0 
                      ? ((member.completed / member.totalAssigned) * 100).toFixed(1) 
                      : '0.0';
                    
                    return (
                      <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => router.push(`/committee?filter=${member.name}`)}>
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-slate-900">{member.name}</p>
                            {member.email && <p className="text-xs text-slate-500">{member.email}</p>}
                          </div>
                        </td>
                        <td className="text-center px-4 py-4 font-semibold text-slate-900">{member.totalAssigned}</td>
                        <td className="text-center px-4 py-4 text-slate-600">{member.toContact}</td>
                        <td className="text-center px-4 py-4 text-blue-600">{member.contacted}</td>
                        <td className="text-center px-4 py-4 text-indigo-600">{member.replied}</td>
                        <td className="text-center px-4 py-4 text-green-600 font-semibold">{member.completed}</td>
                        <td className="text-center px-4 py-4 text-red-600 font-semibold">{member.stalled}</td>
                        <td className="text-center px-4 py-4 text-purple-600">{member.followUps}</td>
                        <td className="text-center px-4 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-green-500 rounded-full" 
                                style={{ width: `${completionRate}%` }}
                              ></div>
                            </div>
                            <span className="text-sm font-medium text-slate-700">{completionRate}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Layout>
    </AdminRoute>
  );
}
```

#### 4.3 Add Admin Navigation Link
**File**: `components/Layout.tsx`

```tsx
// In the navigation array, add:
{ 
  name: 'Admin', 
  href: '/admin/progress', 
  icon: ShieldCheckIcon, 
  description: 'Team management',
  adminOnly: true // NEW flag
},

// Filter navigation based on user role:
{navigation
  .filter(item => !item.adminOnly || user?.isAdmin)
  .map((item) => (
    // ... render navigation item
  ))
}
```

---

## Verification Plan

### Test 1: Admin Access Control
1. Sign in as non-admin user
2. Try to access `/admin/progress`
3. Verify redirect to home page
4. Sign in as admin user
5. Verify access granted to admin pages

### Test 2: Individual Assignment
1. As admin, open company details
2. Change assignee from dropdown
3. Save changes
4. Verify Google Sheet updated
5. Verify UI reflects change

### Test 3: Bulk Assignment
1. As admin, go to All Companies page
2. Select multiple companies using checkboxes
3. Select assignee from bulk action bar
4. Confirm assignment
5. Verify all selected companies updated in Google Sheets
6. Verify UI shows updated assignments

### Test 4: Progress Dashboard
1. As admin, navigate to `/admin/progress`
2. Verify all committee members listed
3. Verify stats match actual data
4. Click on member row
5. Verify navigation to filtered view of their companies
6. Test sorting by different columns

---

## Security Considerations

1. **Admin Role Verification**: All admin endpoints must verify `role === 'admin'` from Committee_Members sheet
2. **Session Validation**: Use `getServerSession` on all admin API routes
3. **Input Validation**: Validate company IDs and assignee names
4. **Audit Logging**: Log all assignment changes to Logs sheet
5. **Rate Limiting**: Consider adding rate limits to bulk operations

---

## Timeline Estimate

- **Phase 1** (Admin Role Detection): 30 minutes
- **Phase 2** (Bulk Assignment UI & API): 2 hours
- **Phase 3** (Individual Assignment): 1 hour
- **Phase 4** (Progress Dashboard): 2 hours
- **Testing & Polish**: 1 hour

**Total**: ~6-7 hours

---

## Success Criteria

- [x] Admin users can access admin-only pages
- [x] Non-admin users cannot access admin pages
- [x] Admin can select multiple companies and bulk assign
- [x] Admin can change individual company assignment
- [x] Progress dashboard shows accurate stats for all members
- [x] All assignment changes logged to Google Sheets
- [x] UI provides clear feedback on assignment actions
- [x] Bulk operations handle errors gracefully
