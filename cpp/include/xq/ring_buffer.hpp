// ring_buffer.hpp
// Single-producer / single-consumer lock-free ring buffer.
//
// WHY THIS EXISTS (interview point): in a real trading stack the network
// thread that decodes exchange messages must never block on the strategy
// thread. A bounded SPSC queue with atomics + acquire/release ordering hands
// events across the thread boundary with no locks and no allocation on the
// hot path. This is the standard pattern behind low-latency feed handlers.
//
// Capacity must be a power of two so index wrap is a mask, not a modulo.
#pragma once
#include <atomic>
#include <cstddef>
#include <optional>
#include <vector>

namespace xq {

template <typename T>
class SpscRingBuffer {
public:
    explicit SpscRingBuffer(std::size_t capacity_pow2)
        : mask_(capacity_pow2 - 1), buf_(capacity_pow2) {
        // capacity must be a power of two
    }

    // Producer side only. Returns false if full (caller decides: drop or spin).
    bool push(const T& item) noexcept {
        const auto head = head_.load(std::memory_order_relaxed);
        const auto next = (head + 1) & mask_;
        if (next == tail_.load(std::memory_order_acquire))
            return false;                      // full
        buf_[head] = item;
        head_.store(next, std::memory_order_release);
        return true;
    }

    // Consumer side only.
    std::optional<T> pop() noexcept {
        const auto tail = tail_.load(std::memory_order_relaxed);
        if (tail == head_.load(std::memory_order_acquire))
            return std::nullopt;               // empty
        T item = buf_[tail];
        tail_.store((tail + 1) & mask_, std::memory_order_release);
        return item;
    }

private:
    const std::size_t mask_;
    std::vector<T> buf_;
    alignas(64) std::atomic<std::size_t> head_{0};  // 64B align: avoid false
    alignas(64) std::atomic<std::size_t> tail_{0};  // sharing between cores
};

}  // namespace xq
