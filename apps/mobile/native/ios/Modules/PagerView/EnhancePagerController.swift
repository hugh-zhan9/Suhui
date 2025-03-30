//
//  PagerView.swift
//  FollowNative
//
//  Created by Innei on 2025/3/30.
//

import SnapKit
import UIKit

private class PagerViewController: UIViewController {
  private var pageIndex = 0
  private var pageView: UIView? = nil

  convenience init(index: Int, view: UIView) {
    self.init()
    self.pageIndex = index
    self.pageView = view
  }

  override func loadView() {
    view = pageView
  }

  public func getPageIndex() -> Int { pageIndex }
  public func setPageIndex(index: Int) { self.pageIndex = index }
}

class EnhancePagerController: UIPageViewController, UIScrollViewDelegate {
  private var pageControllers = [PagerViewController]()
  private var currentPageIndex: Int = 0 {
    willSet {
//      debugPrint("set", newValue, currentPageIndex)
       
      if newValue != currentPageIndex {
        // notify
      }
    }
  }

  convenience init(pageViews: [UIView], initialPageIndex: Int = 0) {
    self.init(transitionStyle: .scroll, navigationOrientation: .horizontal)
    self.pageControllers = pageViews.enumerated().map { (index, view) in
      PagerViewController(index: index, view: view)
    }
    currentPageIndex = initialPageIndex
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    dataSource = self
    delegate = self

    let hasPageController = pageControllers.indices.contains(currentPageIndex)

    if hasPageController {
      let vc = pageControllers[currentPageIndex]
      self.setViewControllers([vc], direction: .forward, animated: false)
      vc.didMove(toParent: self)
    } else {
      self.setViewControllers([UIViewController()], direction: .forward, animated: false)
    }
    
    
    self.view.subviews.forEach {
      if let scrollView = $0 as? UIScrollView {
        scrollView.delegate = self
      }
    }
  }

  var startOffset: CGFloat = 0

  func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
    startOffset = scrollView.contentOffset.x
    debugPrint(scrollView.contentOffset.x)
  }

  public func scrollViewDidScroll(_ scrollView: UIScrollView) {

    var direction = 0  //scroll stopped

    if startOffset < scrollView.contentOffset.x {
      direction = 1  //going right
    } else if startOffset > scrollView.contentOffset.x {
      direction = -1  //going left
    }

    let positionFromStartOfCurrentPage = abs(startOffset - scrollView.contentOffset.x)
    let percent = positionFromStartOfCurrentPage / self.view.frame.width

    debugPrint(percent, direction)
  }

}

// Add this extension to implement UIPageViewControllerDataSource
extension EnhancePagerController: UIPageViewControllerDataSource, UIPageViewControllerDelegate {
  func pageViewController(
    _ pageViewController: UIPageViewController,
    viewControllerBefore viewController: UIViewController
  ) -> UIViewController? {
    if let pagerController = pageViewController.viewControllers?.first as? PagerViewController {
      let index = pagerController.getPageIndex()
      if index > 0 {
        return pageControllers[index - 1]
      }

    }

    return nil
  }

  func pageViewController(
    _ pageViewController: UIPageViewController, viewControllerAfter viewController: UIViewController
  ) -> UIViewController? {
    if let pagerController = pageViewController.viewControllers?.first as? PagerViewController {
      let index = pagerController.getPageIndex()
      if index < pageControllers.count - 1 {
        return pageControllers[index + 1]
      }
    }

    return nil
  }

  func pageViewController(
    _ pageViewController: UIPageViewController,
    didFinishAnimating finished: Bool,
    previousViewControllers: [UIViewController],
    transitionCompleted completed: Bool
  ) {
    if completed {
      if let currentVC = pageViewController.viewControllers?.first as? PagerViewController,
        let newIndex = pageControllers.firstIndex(of: currentVC)
      {
        currentPageIndex = newIndex
      }
    }
  }

}

// MARK: Add this extension to implement insert and remove page view
extension EnhancePagerController {

  public func insertPageView(view: UIView, animated: Bool = false) {
    let index = pageControllers.count
    let vc = PagerViewController(index: index, view: view)

    let hasPageControllerBefore = pageControllers.count > 0

    pageControllers.append(vc)
    debugPrint("inset \(index) \(pageControllers.count)")

    if !hasPageControllerBefore {
      self.setViewControllers([vc], direction: .forward, animated: animated)
    }
  }

  public func removePageView(at index: Int) {
    pageControllers.remove(at: index)

    if currentPageIndex == index {
      if !pageControllers.isEmpty {
        let newIndex = min(index, pageControllers.count - 1)
        let newVC = pageControllers[newIndex]
        self.setViewControllers([newVC], direction: .forward, animated: true)
        currentPageIndex = newIndex
      } else {
        let emptyVC = UIViewController()
        self.setViewControllers([emptyVC], direction: .forward, animated: false)
        currentPageIndex = 0
      }
    } else if currentPageIndex > index {
      currentPageIndex -= 1
    }

    for (i, pagerVC) in pageControllers.enumerated() {
      pagerVC.setPageIndex(index: i)
    }
  }

}
