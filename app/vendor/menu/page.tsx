"use client";

import { useState, useEffect } from 'react';
import { HapticFeedback } from '@/components/ui/haptic-feedback';
import { Plus, Package, RefreshCw, Image as ImageIcon, X, Edit2, Trash2, CheckCircle } from 'lucide-react';

interface CatalogItem {
  id: number;
  vendor_id: number;
  name: string;
  category: string | null;
  price: string | number;
  is_available: boolean;
  stock_qty: number | null;
  low_stock_threshold: number;
  image_url?: string;
}

export default function VendorMenuPage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  
  // Restock modal state
  const [restockModalItem, setRestockModalItem] = useState<CatalogItem | null>(null);
  const [restockAmount, setRestockAmount] = useState<string>('24');
  const [isUncapped, setIsUncapped] = useState<boolean>(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // New Item modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('Drinks');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemStock, setNewItemStock] = useState('50');
  const [newItemIsUncapped, setNewItemIsUncapped] = useState(false);
  const [newItemImage, setNewItemImage] = useState('');
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  // Edit Item modal state
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    category: 'Drinks',
    price: '',
    stock_qty: '50',
    isUncapped: false,
    low_stock_threshold: '5',
    image_url: '',
    is_available: true
  });
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  
  // Extract unique categories from catalog
  const categories = Array.from(
    new Set(catalog.map(c => c.category || "General").filter(Boolean))
  ) as string[];

  const fetchItems = () => {
    fetch('/api/vendor/items')
      .then(res => res.json())
      .then(data => {
        setCatalog(Array.isArray(data) ? data : data.items || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const toggleStatus = async (item: CatalogItem) => {
    HapticFeedback.trigger('confirmation');
    
    // Optimistic update
    setCatalog(prev => prev.map(c => c.id === item.id ? { ...c, is_available: !c.is_available } : c));
    
    try {
      const res = await fetch(`/api/vendor/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_available: !item.is_available })
      });
      if (!res.ok) {
        // Revert on error
        setCatalog(prev => prev.map(c => c.id === item.id ? { ...c, is_available: item.is_available } : c));
        alert("Failed to update status");
      }
    } catch (err) {
      setCatalog(prev => prev.map(c => c.id === item.id ? { ...c, is_available: item.is_available } : c));
    }
  };

  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockModalItem) return;

    setIsUpdating(true);
    HapticFeedback.trigger('confirmation');

    let newStock: number | null = null;
    if (!isUncapped) {
      const added = parseInt(restockAmount, 10) || 0;
      const current = restockModalItem.stock_qty || 0;
      newStock = Math.max(0, current + added);
    }

    try {
      const res = await fetch(`/api/vendor/items/${restockModalItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stock_qty: newStock,
          is_available: true
        })
      });

      if (res.ok) {
        HapticFeedback.trigger('success');
        setCatalog(prev => prev.map(c => c.id === restockModalItem.id ? {
          ...c,
          stock_qty: newStock,
          is_available: true
        } : c));
        setRestockModalItem(null);
      } else {
        HapticFeedback.trigger('error');
        alert("Failed to update stock");
      }
    } catch (err) {
      HapticFeedback.trigger('error');
      alert("Error connecting to server");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName || !newItemPrice) return;

    setIsSubmittingNew(true);
    HapticFeedback.trigger('confirmation');

    const payload = {
      name: newItemName.trim(),
      category: newItemCategory.trim() || 'General',
      price: parseFloat(newItemPrice),
      stock_qty: newItemIsUncapped ? null : (parseInt(newItemStock, 10) || 0),
      image_url: newItemImage.trim(),
      is_available: true
    };

    try {
      const res = await fetch('/api/vendor/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        HapticFeedback.trigger('success');
        setCatalog(prev => [...prev, data.item]);
        setShowAddModal(false);
        // Reset form
        setNewItemName('');
        setNewItemPrice('');
        setNewItemStock('50');
        setNewItemImage('');
        setNewItemIsUncapped(false);
      } else {
        HapticFeedback.trigger('error');
        alert(data.message || "Failed to create item");
      }
    } catch (err) {
      HapticFeedback.trigger('error');
      alert("Error adding item");
    } finally {
      setIsSubmittingNew(false);
    }
  };

  const openEditModal = (item: CatalogItem) => {
    HapticFeedback.trigger('confirmation');
    setEditingItem(item);
    setEditForm({
      name: item.name,
      category: item.category || 'Drinks',
      price: String(item.price),
      stock_qty: item.stock_qty !== null ? String(item.stock_qty) : '',
      isUncapped: item.stock_qty === null || item.stock_qty === undefined,
      low_stock_threshold: String(item.low_stock_threshold || 5),
      image_url: item.image_url || '',
      is_available: item.is_available
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editForm.name.trim() || !editForm.price) return;

    setIsSubmittingEdit(true);
    HapticFeedback.trigger('confirmation');

    const payload = {
      name: editForm.name.trim(),
      category: editForm.category.trim() || 'General',
      price: parseFloat(editForm.price),
      stock_qty: editForm.isUncapped ? null : (parseInt(editForm.stock_qty, 10) || 0),
      low_stock_threshold: parseInt(editForm.low_stock_threshold, 10) || 5,
      image_url: editForm.image_url.trim(),
      is_available: editForm.is_available
    };

    try {
      const res = await fetch(`/api/vendor/items/${editingItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        HapticFeedback.trigger('success');
        setCatalog(prev => prev.map(c => c.id === editingItem.id ? data.item : c));
        setEditingItem(null);
      } else {
        HapticFeedback.trigger('error');
        alert(data.message || "Failed to update item");
      }
    } catch (err) {
      HapticFeedback.trigger('error');
      alert("Error updating item");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDeleteItem = async (item: CatalogItem) => {
    if (!confirm(`Are you sure you want to delete "${item.name}" from your stall catalog?`)) return;

    setDeletingId(item.id);
    HapticFeedback.trigger('confirmation');

    try {
      const res = await fetch(`/api/vendor/items/${item.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        HapticFeedback.trigger('success');
        setCatalog(prev => prev.filter(c => c.id !== item.id));
      } else {
        HapticFeedback.trigger('error');
        alert(data.message || "Failed to delete item");
      }
    } catch (err) {
      HapticFeedback.trigger('error');
      alert("Network error deleting item");
    } finally {
      setDeletingId(null);
    }
  };

  // Filter items by category
  const filteredCatalog = selectedCategory === "ALL"
    ? catalog
    : catalog.filter(c => (c.category || "General").toLowerCase() === selectedCategory.toLowerCase());

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 lg:p-8 pb-32 md:pb-8 bg-brand-off-white font-mono text-brand-navy">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-wider">STALL CATALOG & INVENTORY</h1>
          <p className="text-xs uppercase font-bold opacity-60">Manage products, prices, categories, and mid-event stock replenishment</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-brand-accent text-brand-navy border-4 border-brand-navy px-5 py-3 font-display uppercase text-lg shadow-(--shadow-brut-sm) hover:bg-brand-navy hover:text-brand-accent active:translate-y-1 transition-all cursor-pointer"
        >
          <Plus className="w-5 h-5" /> Add New Item / Stock
        </button>
      </div>

      {/* CATEGORY FILTER BUTTONS */}
      <div className="mb-6 flex overflow-x-auto gap-2 custom-scrollbar pb-2 items-center">
        <div className="font-bold uppercase text-xs flex items-center mr-2 opacity-70">Categories:</div>
        
        {/* ALL BUTTON */}
        <button
          onClick={() => {
            HapticFeedback.trigger('confirmation');
            setSelectedCategory("ALL");
          }}
          className={`px-3 py-1.5 border-2 border-brand-navy font-bold text-xs uppercase transition-colors cursor-pointer whitespace-nowrap ${
            selectedCategory === "ALL"
              ? "bg-brand-navy text-brand-accent shadow-(--shadow-brut-xs)"
              : "bg-white text-brand-navy hover:bg-stone-100"
          }`}
        >
          ALL ({catalog.length})
        </button>

        {/* INDIVIDUAL CATEGORIES */}
        {categories.map(cat => {
          const count = catalog.filter(c => (c.category || "General").toLowerCase() === cat.toLowerCase()).length;
          const isActive = selectedCategory.toLowerCase() === cat.toLowerCase();
          return (
            <button
              key={cat}
              onClick={() => {
                HapticFeedback.trigger('confirmation');
                setSelectedCategory(isActive ? "ALL" : cat);
              }}
              className={`px-3 py-1.5 border-2 border-brand-navy font-bold text-xs uppercase transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? "bg-brand-navy text-brand-accent shadow-(--shadow-brut-xs)"
                  : "bg-white text-brand-navy hover:bg-stone-100"
              }`}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="animate-pulse font-bold uppercase text-lg py-12 text-center">Loading Catalog...</div>
      ) : (
        <div className="flex flex-col gap-4 pb-20">
          {filteredCatalog.map(item => {
            const hasCountedStock = item.stock_qty !== null && item.stock_qty !== undefined;
            const isOut = hasCountedStock && Number(item.stock_qty) <= 0;
            const isDeleting = deletingId === item.id;

            return (
              <div key={item.id} className="bg-white border-4 border-brand-navy p-4 md:p-6 shadow-(--shadow-brut-md)">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                  <div className="flex items-center gap-4">
                    {/* Item Image Preview */}
                    <div className="w-16 h-16 border-2 border-brand-navy bg-brand-navy/10 flex items-center justify-center overflow-hidden shrink-0">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-6 h-6 opacity-30 text-brand-navy" />
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-xl uppercase flex items-center gap-2">
                        {item.name}
                      </div>
                      <div className="text-xs opacity-70 uppercase mt-1">
                        KES {Number(item.price).toLocaleString()} <span className="px-1">·</span> {item.category || "General"}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Live Stock Status Badge */}
                    {hasCountedStock ? (
                      <span className={`font-bold text-xs px-3 py-1 border-2 border-brand-navy uppercase ${
                        isOut 
                          ? "bg-red-600 text-white" 
                          : Number(item.stock_qty) <= (item.low_stock_threshold || 5)
                            ? "bg-amber-400 text-brand-navy"
                            : "bg-brand-navy text-brand-accent"
                      }`}>
                        Stock: {item.stock_qty} Units
                      </span>
                    ) : (
                      <span className="bg-blue-100 text-blue-900 border-2 border-blue-900 font-bold text-xs px-3 py-1 uppercase">
                        Continuous / Uncapped (Kitchen)
                      </span>
                    )}

                    {/* Availability Badge */}
                    {item.is_available ? (
                      <span className="bg-green-100 text-green-800 font-bold text-xs px-3 py-1 border-2 border-green-800 uppercase">Active</span>
                    ) : (
                      <span className="bg-red-100 text-red-800 font-bold text-xs px-3 py-1 border-2 border-red-800 uppercase">Disabled / Sold Out</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2.5 mt-4 border-t-2 border-brand-navy border-dashed pt-4 items-center">
                  {/* Restock Button */}
                  <button 
                    onClick={() => {
                      setRestockModalItem(item);
                      setIsUncapped(item.stock_qty === null || item.stock_qty === undefined);
                      setRestockAmount('24');
                    }}
                    className="flex items-center gap-2 px-3 py-2 bg-brand-navy text-brand-accent border-2 border-brand-navy font-bold text-xs uppercase hover:bg-brand-accent hover:text-brand-navy shadow-(--shadow-brut-xs) transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Adjust Stock
                  </button>

                  {/* Edit Item Button */}
                  <button 
                    onClick={() => openEditModal(item)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white text-brand-navy border-2 border-brand-navy font-bold text-xs uppercase hover:bg-yellow-200 shadow-(--shadow-brut-xs) transition-colors cursor-pointer"
                    title="Edit Item Name, Category, Price"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Edit Item
                  </button>

                  {/* Quick toggle sold out */}
                  <button 
                    onClick={() => toggleStatus(item)}
                    className="px-3 py-2 bg-brand-off-white text-brand-navy border-2 border-brand-navy font-bold text-xs uppercase hover:bg-stone-200 shadow-(--shadow-brut-xs) transition-colors cursor-pointer"
                  >
                    {item.is_available ? "Mark Sold Out" : "Mark Available"}
                  </button>

                  {/* Delete Item Button */}
                  <button 
                    disabled={isDeleting}
                    onClick={() => handleDeleteItem(item)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white text-red-600 border-2 border-red-600 font-bold text-xs uppercase hover:bg-red-600 hover:text-white shadow-(--shadow-brut-xs) transition-colors cursor-pointer ml-auto disabled:opacity-50"
                    title="Delete Item from Stall"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> {isDeleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            );
          })}

          {filteredCatalog.length === 0 && (
            <div className="p-12 text-center border-4 border-brand-navy font-bold uppercase bg-white">
              <Package className="w-8 h-8 mx-auto opacity-30 mb-2" />
              {selectedCategory === "ALL" 
                ? "No items found. Add some items to start selling." 
                : `No items found in category "${selectedCategory}". Click "ALL" to see all products.`}
            </div>
          )}
        </div>
      )}

      {/* ADD NEW ITEM MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-brand-navy/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-brand-off-white w-full max-w-lg border-4 border-brand-navy p-6 shadow-(--shadow-brut-xl-accent)">
            <div className="flex justify-between items-center border-b-4 border-brand-navy pb-3 mb-4">
              <h2 className="font-display text-2xl uppercase flex items-center gap-2">
                <Plus className="w-6 h-6 text-brand-accent" /> Add New Item to Stall
              </h2>
              <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-brand-navy/15 border border-brand-navy cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddNewItem} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Item / Product Name *</label>
                <input 
                  type="text" 
                  required
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  placeholder="e.g. Tusker Cider 500ml or Nyama Choma"
                  className="w-full p-2.5 border-2 border-brand-navy bg-white font-mono text-sm focus:outline-none focus:ring-4 focus:ring-brand-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase mb-1">Category</label>
                  <select 
                    value={newItemCategory}
                    onChange={e => setNewItemCategory(e.target.value)}
                    className="w-full p-2.5 border-2 border-brand-navy bg-white font-mono text-sm focus:outline-none focus:ring-4 focus:ring-brand-accent"
                  >
                    <option value="Drinks">Drinks</option>
                    <option value="Kitchen">Kitchen</option>
                    <option value="Cocktails">Cocktails</option>
                    <option value="Snacks">Snacks</option>
                    <option value="Merch">Merchandise</option>
                    <option value="General">General</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase mb-1">Selling Price (KES) *</label>
                  <input 
                    type="number" 
                    required
                    min="0"
                    value={newItemPrice}
                    onChange={e => setNewItemPrice(e.target.value)}
                    placeholder="e.g. 350"
                    className="w-full p-2.5 border-2 border-brand-navy bg-white font-mono text-sm focus:outline-none focus:ring-4 focus:ring-brand-accent"
                  />
                </div>
              </div>

              {/* Image URL Input with instant preview */}
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Stock / Product Image URL (Optional)</label>
                <div className="flex gap-2 items-center">
                  <input 
                    type="url" 
                    value={newItemImage}
                    onChange={e => setNewItemImage(e.target.value)}
                    placeholder="https://example.com/item.jpg"
                    className="flex-1 p-2.5 border-2 border-brand-navy bg-white font-mono text-xs focus:outline-none focus:ring-4 focus:ring-brand-accent"
                  />
                  {newItemImage && (
                    <div className="w-10 h-10 border border-brand-navy shrink-0 overflow-hidden bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={newItemImage} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>

              {/* Kitchen Uncapped vs Counted Initial Stock */}
              <div className="border-2 border-brand-navy p-3 bg-white space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={newItemIsUncapped} 
                    onChange={e => setNewItemIsUncapped(e.target.checked)}
                    className="w-5 h-5 accent-brand-accent cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-xs uppercase block">Kitchen Item (Uncapped Prep / No Count)</span>
                    <span className="text-[10px] opacity-60 block">E.g. Ugali, sausages grilled continuously</span>
                  </div>
                </label>

                {!newItemIsUncapped && (
                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">Initial Stock Count</label>
                    <input 
                      type="number" 
                      min="0"
                      value={newItemStock}
                      onChange={e => setNewItemStock(e.target.value)}
                      className="w-full p-2 border-2 border-brand-navy bg-brand-off-white font-mono text-base font-bold"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-3 border-t-2 border-brand-navy">
                <button 
                  type="button" 
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3 border-2 border-brand-navy font-bold uppercase hover:bg-brand-navy/10 text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmittingNew}
                  className="flex-1 py-3 bg-brand-accent text-brand-navy border-2 border-brand-navy font-display text-xl uppercase hover:bg-brand-navy hover:text-brand-accent shadow-(--shadow-brut-sm) transition-colors cursor-pointer"
                >
                  {isSubmittingNew ? "Saving..." : "Add to Stall"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ITEM MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-brand-navy/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-brand-off-white w-full max-w-lg border-4 border-brand-navy p-6 shadow-(--shadow-brut-xl-accent)">
            <div className="flex justify-between items-center border-b-4 border-brand-navy pb-3 mb-4">
              <h2 className="font-display text-2xl uppercase flex items-center gap-2">
                <Edit2 className="w-6 h-6 text-brand-accent" /> Edit Product: {editingItem.name}
              </h2>
              <button onClick={() => setEditingItem(null)} className="p-1 hover:bg-brand-navy/15 border border-brand-navy cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Item / Product Name *</label>
                <input 
                  type="text" 
                  required
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="e.g. KC FUSION PINEAPPLE"
                  className="w-full p-2.5 border-2 border-brand-navy bg-white font-mono text-sm focus:outline-none focus:ring-4 focus:ring-brand-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase mb-1">Category</label>
                  <select 
                    value={editForm.category}
                    onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                    className="w-full p-2.5 border-2 border-brand-navy bg-white font-mono text-sm focus:outline-none focus:ring-4 focus:ring-brand-accent"
                  >
                    <option value="Drinks">Drinks</option>
                    <option value="Kitchen">Kitchen</option>
                    <option value="Cocktails">Cocktails</option>
                    <option value="Snacks">Snacks</option>
                    <option value="Merch">Merchandise</option>
                    <option value="General">General</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase mb-1">Selling Price (KES) *</label>
                  <input 
                    type="number" 
                    required
                    min="0"
                    value={editForm.price}
                    onChange={e => setEditForm({ ...editForm, price: e.target.value })}
                    placeholder="e.g. 1200"
                    className="w-full p-2.5 border-2 border-brand-navy bg-white font-mono text-sm focus:outline-none focus:ring-4 focus:ring-brand-accent"
                  />
                </div>
              </div>

              {/* Image URL Input */}
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Stock / Product Image URL (Optional)</label>
                <div className="flex gap-2 items-center">
                  <input 
                    type="url" 
                    value={editForm.image_url}
                    onChange={e => setEditForm({ ...editForm, image_url: e.target.value })}
                    placeholder="https://example.com/item.jpg"
                    className="flex-1 p-2.5 border-2 border-brand-navy bg-white font-mono text-xs focus:outline-none focus:ring-4 focus:ring-brand-accent"
                  />
                  {editForm.image_url && (
                    <div className="w-10 h-10 border border-brand-navy shrink-0 overflow-hidden bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={editForm.image_url} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>

              {/* Stock settings */}
              <div className="border-2 border-brand-navy p-3 bg-white space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={editForm.isUncapped} 
                    onChange={e => setEditForm({ ...editForm, isUncapped: e.target.checked })}
                    className="w-5 h-5 accent-brand-accent cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-xs uppercase block">Kitchen Item (Uncapped Prep / No Count)</span>
                    <span className="text-[10px] opacity-60 block">Continuous production without inventory tracking</span>
                  </div>
                </label>

                {!editForm.isUncapped && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold uppercase mb-1">Current Stock Count</label>
                      <input 
                        type="number" 
                        min="0"
                        value={editForm.stock_qty}
                        onChange={e => setEditForm({ ...editForm, stock_qty: e.target.value })}
                        className="w-full p-2 border-2 border-brand-navy bg-brand-off-white font-mono text-base font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase mb-1">Low Stock Warning Alert</label>
                      <input 
                        type="number" 
                        min="1"
                        value={editForm.low_stock_threshold}
                        onChange={e => setEditForm({ ...editForm, low_stock_threshold: e.target.value })}
                        className="w-full p-2 border-2 border-brand-navy bg-brand-off-white font-mono text-base font-bold"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="edit_is_available"
                  checked={editForm.is_available}
                  onChange={(e) => setEditForm({ ...editForm, is_available: e.target.checked })}
                  className="w-4 h-4 accent-brand-navy cursor-pointer"
                />
                <label htmlFor="edit_is_available" className="text-xs font-bold uppercase cursor-pointer">
                  Item is Available for Sale in POS
                </label>
              </div>

              <div className="flex gap-3 pt-3 border-t-2 border-brand-navy">
                <button 
                  type="button" 
                  onClick={() => setEditingItem(null)}
                  className="flex-1 py-3 border-2 border-brand-navy font-bold uppercase hover:bg-brand-navy/10 text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmittingEdit}
                  className="flex-1 py-3 bg-brand-accent text-brand-navy border-2 border-brand-navy font-display text-xl uppercase hover:bg-brand-navy hover:text-brand-accent shadow-(--shadow-brut-sm) transition-colors cursor-pointer"
                >
                  {isSubmittingEdit ? "Saving..." : "Update Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MID-NIGHT RESTOCK MODAL */}
      {restockModalItem && (
        <div className="fixed inset-0 z-50 bg-brand-navy/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-brand-off-white w-full max-w-md border-4 border-brand-navy p-6 shadow-(--shadow-brut-xl-accent)">
            <h2 className="font-display text-2xl uppercase border-b-4 border-brand-navy pb-3 mb-4 flex items-center gap-2">
              <Package className="w-6 h-6 text-brand-accent" /> Restock: {restockModalItem.name}
            </h2>

            <form onSubmit={handleRestockSubmit} className="space-y-4">
              <div className="p-3 bg-white border-2 border-brand-navy text-xs space-y-1">
                <p><span className="opacity-60">Current Stock:</span> <strong>{restockModalItem.stock_qty !== null ? `${restockModalItem.stock_qty} Units` : 'Uncapped / Kitchen Prep'}</strong></p>
                <p><span className="opacity-60">Category:</span> <strong>{restockModalItem.category || 'General'}</strong></p>
              </div>

              {/* Toggle Uncapped vs Counted */}
              <div className="border-2 border-brand-navy p-3 bg-white">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={isUncapped} 
                    onChange={e => setIsUncapped(e.target.checked)}
                    className="w-5 h-5 accent-brand-accent cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-xs uppercase block">Kitchen Item (Uncapped / No Count)</span>
                    <span className="text-[10px] opacity-60 block">Keep coming in directly (e.g. Ugali, Nyama Choma, Stew)</span>
                  </div>
                </label>
              </div>

              {!isUncapped && (
                <div>
                  <label className="block text-xs font-bold uppercase mb-2">Units to Add Now (e.g. Crates/Packs)</label>
                  <div className="flex gap-2">
                    <input 
                      type="number" 
                      min="1"
                      required={!isUncapped}
                      value={restockAmount}
                      onChange={e => setRestockAmount(e.target.value)}
                      className="flex-1 p-3 border-2 border-brand-navy bg-white font-mono text-xl font-bold focus:outline-none focus:ring-4 focus:ring-brand-accent"
                      placeholder="e.g. 24"
                    />
                  </div>
                  {/* Quick-add buttons */}
                  <div className="flex gap-2 mt-2">
                    {[12, 24, 48, 100].map(qty => (
                      <button
                        type="button"
                        key={qty}
                        onClick={() => setRestockAmount(qty.toString())}
                        className="flex-1 py-1 text-xs border border-brand-navy bg-white hover:bg-brand-accent font-bold cursor-pointer"
                      >
                        +{qty}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t-2 border-brand-navy">
                <button 
                  type="button" 
                  onClick={() => setRestockModalItem(null)}
                  className="flex-1 py-3 border-2 border-brand-navy font-bold uppercase hover:bg-brand-navy/10 text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isUpdating}
                  className="flex-1 py-3 bg-brand-navy text-brand-accent border-2 border-brand-navy font-display text-lg uppercase hover:bg-brand-accent hover:text-brand-navy shadow-(--shadow-brut-sm) transition-colors cursor-pointer"
                >
                  {isUpdating ? "Saving..." : "Save Restock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
