"use client";

import { useState } from 'react';
import { HapticFeedback } from '@/components/ui/haptic-feedback';

interface TabTransaction {
  id: string;
  type: 'charge' | 'payment';
  amount: number;
  time: string;
  operator: string;
  details: string;
}

interface CustomerTab {
  id: string;
  name: string;
  phone: string;
  balance: number;
  limit: number;
  transactions: TabTransaction[];
}

const DUMMY_TABS: CustomerTab[] = [
  {
    id: 'T1',
    name: 'Sammy Gitau (VIP)',
    phone: '0712345678',
    balance: 2400,
    limit: 5000,
    transactions: [
      { id: 'tx1', type: 'charge', amount: 1400, time: '22:45', operator: 'Daniel', details: '4x Mango Crush, 1x Shisha' },
      { id: 'tx2', type: 'charge', amount: 1000, time: '20:15', operator: 'Daniel', details: '2x Jager Bomb' }
    ]
  },
  {
    id: 'T2',
    name: 'Main Stage Crew',
    phone: '0799887766',
    balance: 4500,
    limit: 10000,
    transactions: [
      { id: 'tx3', type: 'charge', amount: 4500, time: '18:30', operator: 'Sarah', details: 'Crew Dinner Combo x10' }
    ]
  }
];

export default function VendorTabsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTab, setExpandedTab] = useState<string | null>(null);
  
  const toggleTab = (id: string) => {
    HapticFeedback.trigger('confirmation');
    setExpandedTab(prev => prev === id ? null : id);
  };

  const handleAction = (actionName: string) => {
    HapticFeedback.trigger('confirmation');
    alert(`${actionName} triggered! (MVP functionality)`);
  };

  const filteredTabs = DUMMY_TABS.filter(tab => 
    tab.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    tab.phone.includes(searchTerm)
  );

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 lg:p-8 bg-brand-bg overflow-y-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="font-display text-3xl">CUSTOMER TABS</h1>
          <div className="text-caption font-bold text-brand-navy-light uppercase">Stall: Jaba Juice | Active Open Tabs: 2</div>
        </div>
        <button className="px-6 py-3 bg-brand-accent text-brand-black border-4 border-brand-black font-bold uppercase active:translate-y-1 active:shadow-none shadow-[4px_4px_0px_0px_#16181D] transition-transform">
          + Open New Tab
        </button>
      </div>

      <div className="mb-6 relative">
        <input 
          type="text" 
          placeholder="SEARCH BY NAME OR PHONE NUMBER..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full md:max-w-md p-4 bg-brand-off-white border-4 border-brand-black font-bold uppercase text-body shadow-[4px_4px_0px_0px_#16181D] focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-4">
        {filteredTabs.map(tab => (
          <div key={tab.id} className="bg-brand-off-white border-4 border-brand-black shadow-[4px_4px_0px_0px_#16181D] overflow-hidden">
            <div 
              className="p-4 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center cursor-pointer hover:bg-white transition-colors"
              onClick={() => toggleTab(tab.id)}
            >
              <div>
                <div className="font-bold text-lg uppercase mb-1">{tab.name}</div>
                <div className="text-caption font-bold text-brand-navy-light uppercase">{tab.phone}</div>
              </div>
              <div className="mt-4 md:mt-0 flex items-center gap-4">
                <div className="text-right">
                  <div className="font-display text-2xl text-brand-danger">KES {tab.balance}</div>
                  <div className="text-caption font-bold text-brand-navy-light uppercase">/ KES {tab.limit} LIMIT</div>
                </div>
                <div className="text-2xl font-bold ml-2">
                  {expandedTab === tab.id ? '−' : '+'}
                </div>
              </div>
            </div>

            {expandedTab === tab.id && (
              <div className="border-t-4 border-brand-black bg-white p-4 md:p-6">
                <div className="flex flex-wrap gap-3 mb-6">
                  <button onClick={() => handleAction('Collect Payment')} className="px-4 py-2 bg-brand-success text-white border-2 border-brand-black font-bold text-caption uppercase shadow-[2px_2px_0px_0px_#16181D] active:translate-y-[2px] active:shadow-none">
                    Collect Payment
                  </button>
                  <button onClick={() => handleAction('Send Statement')} className="px-4 py-2 bg-brand-bg text-brand-black border-2 border-brand-black font-bold text-caption uppercase shadow-[2px_2px_0px_0px_#16181D] active:translate-y-[2px] active:shadow-none">
                    Send WhatsApp Statement
                  </button>
                </div>
                
                <div className="font-bold text-footnote uppercase mb-3 text-brand-navy-light">Transaction Ledger</div>
                <div className="flex flex-col gap-2">
                  {tab.transactions.map(txn => (
                    <div key={txn.id} className="border-2 border-brand-bg p-3 flex justify-between items-center text-footnote">
                      <div>
                        <span className="font-bold uppercase inline-block w-16">{txn.time}</span>
                        <span className="text-brand-navy-light uppercase mr-2">[{txn.operator}]</span>
                        <span>{txn.details}</span>
                      </div>
                      <div className={`font-bold ${txn.type === 'charge' ? 'text-brand-danger' : 'text-brand-success'}`}>
                        {txn.type === 'charge' ? '+' : '-'} KES {txn.amount}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {filteredTabs.length === 0 && (
          <div className="p-8 text-center border-4 border-brand-black bg-brand-off-white font-bold text-brand-navy-light uppercase">
            No tabs found.
          </div>
        )}
      </div>
    </div>
  );
}
